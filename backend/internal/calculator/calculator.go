package calculator

import (
	"errors"
	"regexp"
	"slices"

	"github.com/cockroachdb/apd/v3"
)

const (
	Precision   = 34
	MaxExponent = 6144
	MinExponent = -6143
)

const maxInputLength = 64

var (
	ErrDivisionByZero   = errors.New("division by zero is undefined")
	ErrNegativeSqrt     = errors.New("square root of a negative number is undefined")
	ErrNonReal          = errors.New("result is not a real number")
	ErrOutOfRange       = errors.New("result is outside the supported range")
	ErrInvalidNumber    = errors.New("not a valid decimal number")
	ErrTooManyDigits    = errors.New("numbers may have at most 34 significant digits")
	ErrOperandRange     = errors.New("number is outside the supported range")
	ErrUnknownOperation = errors.New("unknown operation")
	ErrOperandCount     = errors.New("wrong number of operands")
)

// Shared by every request: apd contexts are only safe for concurrent use while unmodified.
var ctx = &apd.Context{
	Precision:   Precision,
	MaxExponent: MaxExponent,
	MinExponent: MinExponent,
	Rounding:    apd.RoundHalfEven,
	Traps:       apd.DefaultTraps,
}

// apd would also accept NaN, Infinity and other forms that are not valid operands.
var numberPattern = regexp.MustCompile(`^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$`)

func Parse(s string) (*apd.Decimal, error) {
	if len(s) > maxInputLength || !numberPattern.MatchString(s) {
		return nil, ErrInvalidNumber
	}
	d, _, err := apd.NewFromString(s)
	if err != nil {
		return nil, ErrInvalidNumber
	}
	d.Reduce(d)
	if d.NumDigits() > Precision {
		return nil, ErrTooManyDigits
	}
	if adjusted := adjustedExponent(d); !d.IsZero() && (adjusted > MaxExponent || adjusted < MinExponent) {
		return nil, ErrOperandRange
	}
	if d.IsZero() {
		d.Negative = false
	}
	return d, nil
}

func Format(d *apd.Decimal) string {
	var r apd.Decimal
	r.Reduce(d)
	if r.IsZero() {
		return "0"
	}
	if adjusted := adjustedExponent(&r); adjusted >= -6 && adjusted < Precision {
		return r.Text('f')
	}
	return r.Text('e')
}

func adjustedExponent(d *apd.Decimal) int64 {
	return d.NumDigits() + int64(d.Exponent) - 1
}

func Add(a, b *apd.Decimal) (*apd.Decimal, error) {
	return apply(func(r *apd.Decimal) (apd.Condition, error) { return ctx.Add(r, a, b) })
}

func Subtract(a, b *apd.Decimal) (*apd.Decimal, error) {
	return apply(func(r *apd.Decimal) (apd.Condition, error) { return ctx.Sub(r, a, b) })
}

func Multiply(a, b *apd.Decimal) (*apd.Decimal, error) {
	return apply(func(r *apd.Decimal) (apd.Condition, error) { return ctx.Mul(r, a, b) })
}

func Divide(a, b *apd.Decimal) (*apd.Decimal, error) {
	if b.IsZero() {
		return nil, ErrDivisionByZero
	}
	return apply(func(r *apd.Decimal) (apd.Condition, error) { return ctx.Quo(r, a, b) })
}

func Power(base, exponent *apd.Decimal) (*apd.Decimal, error) {
	switch {
	case base.IsZero() && exponent.IsZero():
		return apd.New(1, 0), nil
	case base.IsZero() && exponent.Negative:
		return nil, ErrDivisionByZero
	case base.Negative && !isInteger(exponent):
		return nil, ErrNonReal
	}
	return guarded(func(r *apd.Decimal) (apd.Condition, error) { return workCtx.Pow(r, base, exponent) })
}

func Sqrt(a *apd.Decimal) (*apd.Decimal, error) {
	if a.Negative && !a.IsZero() {
		return nil, ErrNegativeSqrt
	}
	return apply(func(r *apd.Decimal) (apd.Condition, error) { return ctx.Sqrt(r, a) })
}

func Percentage(percent, value *apd.Decimal) (*apd.Decimal, error) {
	return apply(func(r *apd.Decimal) (apd.Condition, error) {
		cond, err := ctx.Mul(r, percent, value)
		if err != nil {
			return cond, err
		}
		return ctx.Quo(r, r, apd.New(100, 0))
	})
}

func isInteger(d *apd.Decimal) bool {
	var integ, frac apd.Decimal
	d.Modf(&integ, &frac)
	return frac.IsZero()
}

func apply(op func(result *apd.Decimal) (apd.Condition, error)) (*apd.Decimal, error) {
	result := new(apd.Decimal)
	cond, err := op(result)
	if err != nil {
		switch {
		case cond.DivisionByZero():
			return nil, ErrDivisionByZero
		case cond.InvalidOperation():
			return nil, ErrNonReal
		default:
			return nil, ErrOutOfRange
		}
	}
	if result.IsZero() {
		result.Negative = false
	}
	return result, nil
}

type Options struct {
	AngleUnit AngleUnit
}

type operation struct {
	arity     int
	usesAngle bool
	apply     func(operands []*apd.Decimal, opts Options) (*apd.Decimal, error)
}

func binary(fn func(a, b *apd.Decimal) (*apd.Decimal, error)) operation {
	return operation{arity: 2, apply: func(o []*apd.Decimal, _ Options) (*apd.Decimal, error) { return fn(o[0], o[1]) }}
}

func unary(fn func(a *apd.Decimal) (*apd.Decimal, error)) operation {
	return operation{arity: 1, apply: func(o []*apd.Decimal, _ Options) (*apd.Decimal, error) { return fn(o[0]) }}
}

func trig(fn func(x *apd.Decimal, unit AngleUnit) (*apd.Decimal, error)) operation {
	return operation{arity: 1, usesAngle: true, apply: func(o []*apd.Decimal, opts Options) (*apd.Decimal, error) {
		unit := opts.AngleUnit
		if unit == "" {
			unit = Radians
		}
		return fn(o[0], unit)
	}}
}

var registry = map[string]operation{
	"add":        binary(Add),
	"subtract":   binary(Subtract),
	"multiply":   binary(Multiply),
	"divide":     binary(Divide),
	"power":      binary(Power),
	"percentage": binary(Percentage),
	"mod":        binary(Mod),
	"sqrt":       unary(Sqrt),
	"ln":         unary(Ln),
	"log":        unary(Log),
	"exp":        unary(Exp),
	"factorial":  unary(Factorial),
	"sin":        trig(Sin),
	"cos":        trig(Cos),
	"tan":        trig(Tan),
}

func Arity(name string) (int, bool) {
	op, ok := registry[name]
	return op.arity, ok
}

func UsesAngleUnit(name string) bool {
	return registry[name].usesAngle
}

func Operations() []string {
	names := make([]string, 0, len(registry))
	for name := range registry {
		names = append(names, name)
	}
	slices.Sort(names)
	return names
}

func Calculate(name string, opts Options, operands ...*apd.Decimal) (*apd.Decimal, error) {
	op, ok := registry[name]
	if !ok {
		return nil, ErrUnknownOperation
	}
	if len(operands) != op.arity {
		return nil, ErrOperandCount
	}
	return op.apply(operands, opts)
}
