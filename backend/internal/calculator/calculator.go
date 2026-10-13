// Package calculator implements the arithmetic operations exposed by the API.
//
// Numbers are decimal, not binary floating point: 0.1 + 0.2 is exactly 0.3,
// and every input is represented exactly. Results that cannot be represented
// exactly (1/3, √2) are rounded to 34 significant digits using round-half-even,
// matching the IEEE 754 decimal128 format.
//
// The package is free of transport concerns: operations are pure functions
// that return either a finite result or one of the sentinel errors below.
package calculator

import (
	"errors"
	"regexp"
	"slices"

	"github.com/cockroachdb/apd/v3"
)

// Arithmetic parameters, following IEEE 754 decimal128.
const (
	Precision   = 34
	MaxExponent = 6144
	MinExponent = -6143
)

// maxInputLength bounds the textual size of an operand. A 34-digit number
// with sign, decimal point and exponent fits comfortably.
const maxInputLength = 64

// Domain errors. Callers should compare against them with errors.Is.
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

// ctx is the shared arithmetic context. apd contexts are safe for concurrent
// use as long as they are not mutated.
var ctx = &apd.Context{
	Precision:   Precision,
	MaxExponent: MaxExponent,
	MinExponent: MinExponent,
	Rounding:    apd.RoundHalfEven,
	// Inexact and Rounded are expected (1/3) and therefore not trapped.
	Traps: apd.DefaultTraps,
}

// numberPattern accepts plain and scientific decimal notation, and rejects
// NaN, Infinity, hex and anything else apd would otherwise accept.
var numberPattern = regexp.MustCompile(`^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$`)

// Parse converts decimal text such as "12.50", "-3" or "1e-7" into an exact
// decimal. It rejects values that need more than Precision significant digits
// rather than silently rounding them.
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

// Format renders d in its shortest exact form: trailing zeros are removed,
// plain notation is used for everyday magnitudes and scientific notation
// (e.g. "1.5e+40") otherwise.
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

// adjustedExponent is the power of ten of the most significant digit.
func adjustedExponent(d *apd.Decimal) int64 {
	return d.NumDigits() + int64(d.Exponent) - 1
}

// Add returns a + b.
func Add(a, b *apd.Decimal) (*apd.Decimal, error) {
	return apply(func(r *apd.Decimal) (apd.Condition, error) { return ctx.Add(r, a, b) })
}

// Subtract returns a - b.
func Subtract(a, b *apd.Decimal) (*apd.Decimal, error) {
	return apply(func(r *apd.Decimal) (apd.Condition, error) { return ctx.Sub(r, a, b) })
}

// Multiply returns a × b.
func Multiply(a, b *apd.Decimal) (*apd.Decimal, error) {
	return apply(func(r *apd.Decimal) (apd.Condition, error) { return ctx.Mul(r, a, b) })
}

// Divide returns a ÷ b, or ErrDivisionByZero when b is zero.
func Divide(a, b *apd.Decimal) (*apd.Decimal, error) {
	if b.IsZero() {
		return nil, ErrDivisionByZero
	}
	return apply(func(r *apd.Decimal) (apd.Condition, error) { return ctx.Quo(r, a, b) })
}

// Power returns base raised to exponent. 0^0 is 1 by convention, 0 raised to
// a negative power is a division by zero, and a fractional power of a
// negative base is not a real number.
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

// Sqrt returns the square root of a, or ErrNegativeSqrt when a is negative.
func Sqrt(a *apd.Decimal) (*apd.Decimal, error) {
	if a.Negative && !a.IsZero() {
		return nil, ErrNegativeSqrt
	}
	return apply(func(r *apd.Decimal) (apd.Condition, error) { return ctx.Sqrt(r, a) })
}

// Percentage returns percent% of value, i.e. percent × value ÷ 100. Dividing
// by 100 only shifts the exponent, so the result is exact whenever the
// product fits in 34 digits.
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

// apply runs an apd operation and translates trapped conditions into domain
// errors. Negative zero is normalised so it never reaches clients.
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
			// Overflow, underflow and subnormal results.
			return nil, ErrOutOfRange
		}
	}
	if result.IsZero() {
		result.Negative = false
	}
	return result, nil
}

// Options carries settings that only some operations use.
type Options struct {
	// AngleUnit applies to sin, cos and tan. The zero value means radians.
	AngleUnit AngleUnit
}

// operation adapts a concrete function to a uniform, arity-checked signature.
type operation struct {
	arity int
	// usesAngle marks trigonometric operations, which honour Options.AngleUnit.
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

// registry maps public operation names to their implementation. Adding a new
// operation only requires a new entry here.
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

// Arity reports how many operands the named operation expects and whether the
// operation exists.
func Arity(name string) (int, bool) {
	op, ok := registry[name]
	return op.arity, ok
}

// UsesAngleUnit reports whether the named operation honours Options.AngleUnit.
func UsesAngleUnit(name string) bool {
	return registry[name].usesAngle
}

// Operations returns the names of all supported operations in sorted order.
func Operations() []string {
	names := make([]string, 0, len(registry))
	for name := range registry {
		names = append(names, name)
	}
	slices.Sort(names)
	return names
}

// Calculate runs the named operation after validating the operation name and
// the operand count. Operands should come from Parse.
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
