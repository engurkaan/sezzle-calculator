package calculator

import (
	"errors"

	"github.com/cockroachdb/apd/v3"
)

// Errors for inputs outside a function's domain.
var (
	ErrLogDomain        = errors.New("logarithm is only defined for positive numbers")
	ErrFactorialDomain  = errors.New("factorial is only defined for non-negative integers")
	ErrTangentUndefined = errors.New("tangent is undefined at this angle")
	ErrArgumentTooLarge = errors.New("argument is too large for a trigonometric function")
	ErrInvalidAngleUnit = errors.New(`angle unit must be "deg" or "rad"`)
)

// AngleUnit selects how trigonometric functions interpret their argument.
type AngleUnit string

// Supported angle units.
const (
	Radians AngleUnit = "rad"
	Degrees AngleUnit = "deg"
)

// ParseAngleUnit validates an angle unit. An empty string means radians.
func ParseAngleUnit(s string) (AngleUnit, error) {
	switch AngleUnit(s) {
	case "", Radians:
		return Radians, nil
	case Degrees:
		return Degrees, nil
	}
	return "", ErrInvalidAngleUnit
}

// Mathematical constants to well beyond working precision.
var (
	pi = mustDecimal("3.14159265358979323846264338327950288419716939937510" +
		"58209749445923078164062862089986280348253421170679" +
		"8214808651328230664709384460955058223172535940812848")
	euler = mustDecimal("2.71828182845904523536028747135266249775724709369995" +
		"95749669676277240766303535475945713821785251664274")
)

// Pi and E return the constants rounded to Precision digits.
func Pi() *apd.Decimal { return rounded(pi) }

// E returns Euler's number rounded to Precision digits.
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

// remCtx is wide enough for the integer quotient of any two in-range
// operands (up to 10^(MaxExponent−MinExponent)), so remainders are exact.
var remCtx = &apd.Context{
	Precision:   MaxExponent - MinExponent + Precision,
	MaxExponent: MaxExponent,
	MinExponent: MinExponent,
	Rounding:    apd.RoundHalfEven,
	Traps:       apd.DefaultTraps,
}

// Mod returns the remainder of a ÷ b, with the sign of a (like Go's %).
// The remainder is computed exactly, even when the quotient has thousands
// of digits, and then rounded to Precision digits.
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

// Ln returns the natural logarithm of a.
func Ln(a *apd.Decimal) (*apd.Decimal, error) {
	if a.Sign() <= 0 {
		return nil, ErrLogDomain
	}
	return guarded(func(r *apd.Decimal) (apd.Condition, error) { return workCtx.Ln(r, a) })
}

// Log returns the base-10 logarithm of a.
func Log(a *apd.Decimal) (*apd.Decimal, error) {
	if a.Sign() <= 0 {
		return nil, ErrLogDomain
	}
	return guarded(func(r *apd.Decimal) (apd.Condition, error) { return workCtx.Log10(r, a) })
}

// Exp returns e raised to a.
func Exp(a *apd.Decimal) (*apd.Decimal, error) {
	return guarded(func(r *apd.Decimal) (apd.Condition, error) { return workCtx.Exp(r, a) })
}

// maxFactorial is the largest n whose factorial fits below 10^MaxExponent
// (2000! ≈ 3.3e5735); anything larger is rejected without computing it.
const maxFactorial = 2000

// Factorial returns n! for a non-negative integer n.
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

// --- Trigonometry --------------------------------------------------------
//
// apd has no trigonometric functions, so they are computed here: the
// argument is reduced to [-π/4, π/4] plus a quadrant, then evaluated with a
// Taylor series at extra working precision and rounded once at the end.
// In degrees the reduction is exact decimal arithmetic, so multiples of 90°
// produce exact results (sin 180° = 0, cos 90° = 0, tan 90° is undefined).

// maxTrigArgument bounds |x|. Reducing a larger radian argument would need
// more digits of π than are stored above.
var maxTrigArgument = apd.New(1, 40)

var (
	// reduceCtx is wide enough to reduce arguments up to maxTrigArgument
	// exactly (degrees) or to ~70 correct digits (radians).
	reduceCtx = &apd.Context{Precision: 120, MaxExponent: MaxExponent, MinExponent: MinExponent, Rounding: apd.RoundHalfEven, Traps: apd.DefaultTraps}
	// workCtx carries guard digits through the series before final rounding.
	workCtx = &apd.Context{Precision: Precision + 16, MaxExponent: MaxExponent, MinExponent: MinExponent, Rounding: apd.RoundHalfEven, Traps: apd.DefaultTraps}
)

// Sin returns the sine of x.
func Sin(x *apd.Decimal, unit AngleUnit) (*apd.Decimal, error) {
	s, _, err := sinCos(x, unit)
	if err != nil {
		return nil, err
	}
	return finish(s)
}

// Cos returns the cosine of x.
func Cos(x *apd.Decimal, unit AngleUnit) (*apd.Decimal, error) {
	_, c, err := sinCos(x, unit)
	if err != nil {
		return nil, err
	}
	return finish(c)
}

// Tan returns the tangent of x.
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

// guarded runs op at working precision and rounds the result once, so that
// transcendental functions are correctly rounded in practice (apd alone only
// guarantees an error below one unit in the last place).
func guarded(op func(result *apd.Decimal) (apd.Condition, error)) (*apd.Decimal, error) {
	wide, err := apply(op)
	if err != nil {
		return nil, err
	}
	return finish(wide)
}

// finish rounds a working-precision value to the public precision.
func finish(x *apd.Decimal) (*apd.Decimal, error) {
	return apply(func(r *apd.Decimal) (apd.Condition, error) { return ctx.Round(r, x) })
}

// sinCos returns sin x and cos x at working precision.
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

// reduce writes x as quadrant·(π/2) + r with |r| ≤ π/4, returning r in
// radians at working precision and the quadrant in 0..3.
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

	// k = round(x / quarter); r = x − k·quarter
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
		// r° → radians: r · π / 180
		if _, err := workCtx.Mul(&r, &r, pi); err != nil {
			return nil, 0, err
		}
		if _, err := workCtx.Quo(&r, &r, apd.New(180, 0)); err != nil {
			return nil, 0, err
		}
	}
	return &r, quadrant, nil
}

// sinSeries evaluates sin r = r − r³/3! + r⁵/5! − … for small |r|.
func sinSeries(r *apd.Decimal) *apd.Decimal {
	return taylor(r, new(apd.Decimal).Set(r), 2)
}

// cosSeries evaluates cos r = 1 − r²/2! + r⁴/4! − … for small |r|.
func cosSeries(r *apd.Decimal) *apd.Decimal {
	return taylor(r, apd.New(1, 0), 1)
}

// taylor sums the alternating series whose first term is first and whose
// n-th term is the previous one times −r²/((m)(m+1)), with m starting at
// firstDenominator and advancing by 2.
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
