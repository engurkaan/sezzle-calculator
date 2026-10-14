package calculator

import (
	"errors"

	"github.com/cockroachdb/apd/v3"
)

var (
	ErrLogDomain        = errors.New("logarithm is only defined for positive numbers")
	ErrFactorialDomain  = errors.New("factorial is only defined for non-negative integers")
	ErrTangentUndefined = errors.New("tangent is undefined at this angle")
	ErrArgumentTooLarge = errors.New("argument is too large for a trigonometric function")
	ErrInvalidAngleUnit = errors.New(`angle unit must be "deg" or "rad"`)
)

type AngleUnit string

const (
	Radians AngleUnit = "rad"
	Degrees AngleUnit = "deg"
)

func ParseAngleUnit(s string) (AngleUnit, error) {
	switch AngleUnit(s) {
	case "", Radians:
		return Radians, nil
	case Degrees:
		return Degrees, nil
	}
	return "", ErrInvalidAngleUnit
}

var (
	pi = mustDecimal("3.14159265358979323846264338327950288419716939937510" +
		"58209749445923078164062862089986280348253421170679" +
		"8214808651328230664709384460955058223172535940812848")
	euler = mustDecimal("2.71828182845904523536028747135266249775724709369995" +
		"95749669676277240766303535475945713821785251664274")
)

func Pi() *apd.Decimal { return rounded(pi) }

func E() *apd.Decimal { return rounded(euler) }

func mustDecimal(s string) *apd.Decimal {
	d, _, err := apd.NewFromString(s)
	if err != nil {
		panic(err)
	}
	return d
}

func rounded(x *apd.Decimal) *apd.Decimal {
	d := new(apd.Decimal)
	if _, err := ctx.Round(d, x); err != nil {
		panic(err)
	}
	return d
}

// Wide enough for the integer quotient of any two in-range operands, so remainders are exact.
var remCtx = &apd.Context{
	Precision:   MaxExponent - MinExponent + Precision,
	MaxExponent: MaxExponent,
	MinExponent: MinExponent,
	Rounding:    apd.RoundHalfEven,
	Traps:       apd.DefaultTraps,
}

func Mod(a, b *apd.Decimal) (*apd.Decimal, error) {
	if b.IsZero() {
		return nil, ErrDivisionByZero
	}
	var rem apd.Decimal
	if _, err := remCtx.Rem(&rem, a, b); err != nil {
		return nil, ErrOutOfRange
	}
	return finish(&rem)
}

func Ln(a *apd.Decimal) (*apd.Decimal, error) {
	if a.Sign() <= 0 {
		return nil, ErrLogDomain
	}
	return guarded(func(r *apd.Decimal) (apd.Condition, error) { return workCtx.Ln(r, a) })
}

func Log(a *apd.Decimal) (*apd.Decimal, error) {
	if a.Sign() <= 0 {
		return nil, ErrLogDomain
	}
	return guarded(func(r *apd.Decimal) (apd.Condition, error) { return workCtx.Log10(r, a) })
}

func Exp(a *apd.Decimal) (*apd.Decimal, error) {
	return guarded(func(r *apd.Decimal) (apd.Condition, error) { return workCtx.Exp(r, a) })
}

// 2000! ≈ 3.3e5735. Larger factorials overflow MaxExponent, so they are rejected
// without being computed.
const maxFactorial = 2000

func Factorial(n *apd.Decimal) (*apd.Decimal, error) {
	if n.Negative || !isInteger(n) {
		return nil, ErrFactorialDomain
	}
	limit := apd.New(maxFactorial, 0)
	if n.Cmp(limit) > 0 {
		return nil, ErrOutOfRange
	}
	count, err := n.Int64()
	if err != nil {
		return nil, ErrFactorialDomain
	}
	return apply(func(r *apd.Decimal) (apd.Condition, error) {
		r.SetInt64(1)
		var cond apd.Condition
		for i := int64(2); i <= count; i++ {
			c, err := ctx.Mul(r, r, apd.New(i, 0))
			if err != nil {
				return c, err
			}
			cond |= c
		}
		return cond, nil
	})
}

// apd has no trigonometry. The argument is reduced to [-π/4, π/4] plus a quadrant and a Taylor
// series is summed with guard digits. Degree arguments are reduced exactly, so multiples of 90°
// give exact results (sin 180° = 0, tan 90° is undefined).

// Reducing larger radian arguments would need more digits of π than are stored.
var maxTrigArgument = apd.New(1, 40)

var (
	reduceCtx = &apd.Context{Precision: 120, MaxExponent: MaxExponent, MinExponent: MinExponent, Rounding: apd.RoundHalfEven, Traps: apd.DefaultTraps}
	workCtx   = &apd.Context{Precision: Precision + 16, MaxExponent: MaxExponent, MinExponent: MinExponent, Rounding: apd.RoundHalfEven, Traps: apd.DefaultTraps}
)

func Sin(x *apd.Decimal, unit AngleUnit) (*apd.Decimal, error) {
	s, _, err := sinCos(x, unit)
	if err != nil {
		return nil, err
	}
	return finish(s)
}

func Cos(x *apd.Decimal, unit AngleUnit) (*apd.Decimal, error) {
	_, c, err := sinCos(x, unit)
	if err != nil {
		return nil, err
	}
	return finish(c)
}

func Tan(x *apd.Decimal, unit AngleUnit) (*apd.Decimal, error) {
	s, c, err := sinCos(x, unit)
	if err != nil {
		return nil, err
	}
	if c.IsZero() {
		return nil, ErrTangentUndefined
	}
	t := new(apd.Decimal)
	if _, err := workCtx.Quo(t, s, c); err != nil {
		return nil, ErrOutOfRange
	}
	return finish(t)
}

// apd only guarantees transcendental results to within one unit in the last place, so they are
// computed with guard digits and rounded once.
func guarded(op func(result *apd.Decimal) (apd.Condition, error)) (*apd.Decimal, error) {
	wide, err := apply(op)
	if err != nil {
		return nil, err
	}
	return finish(wide)
}

func finish(x *apd.Decimal) (*apd.Decimal, error) {
	return apply(func(r *apd.Decimal) (apd.Condition, error) { return ctx.Round(r, x) })
}

func sinCos(x *apd.Decimal, unit AngleUnit) (sin, cos *apd.Decimal, err error) {
	var abs apd.Decimal
	abs.Abs(x)
	if abs.Cmp(maxTrigArgument) > 0 {
		return nil, nil, ErrArgumentTooLarge
	}

	r, quadrant, err := reduce(x, unit)
	if err != nil {
		return nil, nil, err
	}
	var s, c *apd.Decimal
	if r.IsZero() {
		s, c = new(apd.Decimal), apd.New(1, 0)
	} else {
		s, c = sinSeries(r), cosSeries(r)
	}

	neg := func(d *apd.Decimal) *apd.Decimal { return new(apd.Decimal).Neg(d) }
	switch quadrant {
	case 0:
		return s, c, nil
	case 1:
		return c, neg(s), nil
	case 2:
		return neg(s), neg(c), nil
	default:
		return neg(c), s, nil
	}
}

func reduce(x *apd.Decimal, unit AngleUnit) (*apd.Decimal, int64, error) {
	var period, quarter apd.Decimal
	if unit == Degrees {
		quarter.SetInt64(90)
	} else {
		if _, err := reduceCtx.Quo(&quarter, pi, apd.New(2, 0)); err != nil {
			return nil, 0, err
		}
	}
	if _, err := reduceCtx.Mul(&period, &quarter, apd.New(4, 0)); err != nil {
		return nil, 0, err
	}

	var k, kq, r apd.Decimal
	if _, err := reduceCtx.Quo(&k, x, &quarter); err != nil {
		return nil, 0, err
	}
	if _, err := reduceCtx.RoundToIntegralValue(&k, &k); err != nil {
		return nil, 0, err
	}
	if _, err := reduceCtx.Mul(&kq, &k, &quarter); err != nil {
		return nil, 0, err
	}
	if _, err := reduceCtx.Sub(&r, x, &kq); err != nil {
		return nil, 0, err
	}

	var q apd.Decimal
	if _, err := reduceCtx.Rem(&q, &k, apd.New(4, 0)); err != nil {
		return nil, 0, err
	}
	quadrant, err := q.Int64()
	if err != nil {
		return nil, 0, err
	}
	quadrant = (quadrant%4 + 4) % 4

	if unit == Degrees && !r.IsZero() {
		if _, err := workCtx.Mul(&r, &r, pi); err != nil {
			return nil, 0, err
		}
		if _, err := workCtx.Quo(&r, &r, apd.New(180, 0)); err != nil {
			return nil, 0, err
		}
	}
	return &r, quadrant, nil
}

func sinSeries(r *apd.Decimal) *apd.Decimal {
	return taylor(r, new(apd.Decimal).Set(r), 2)
}

func cosSeries(r *apd.Decimal) *apd.Decimal {
	return taylor(r, apd.New(1, 0), 1)
}

// taylor sums an alternating series: each term is the previous one times −r²/(m(m+1)), with m
// starting at firstDenominator and increasing by 2.
func taylor(r, first *apd.Decimal, firstDenominator int64) *apd.Decimal {
	var r2 apd.Decimal
	_, _ = workCtx.Mul(&r2, r, r)
	sum := new(apd.Decimal).Set(first)
	term := new(apd.Decimal).Set(first)
	for m := firstDenominator; ; m += 2 {
		_, _ = workCtx.Mul(term, term, &r2)
		_, _ = workCtx.Quo(term, term, apd.New(m*(m+1), 0))
		term.Negative = !term.Negative
		_, _ = workCtx.Add(sum, sum, term)
		if term.IsZero() || adjustedExponent(term) < adjustedExponent(sum)-int64(workCtx.Precision)-1 {
			return sum
		}
	}
}
