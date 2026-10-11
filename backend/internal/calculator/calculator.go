// Package calculator implements the arithmetic operations exposed by the API.
//
// It is deliberately free of any transport concerns: every operation is a pure
// function over float64 values that either returns a finite result or one of
// the sentinel errors declared below.
package calculator

import (
	"errors"
	"math"
	"slices"
)

// Domain errors returned by the operations. Callers should compare against
// them with errors.Is.
var (
	ErrDivisionByZero   = errors.New("division by zero is undefined")
	ErrNegativeSqrt     = errors.New("square root of a negative number is undefined")
	ErrNonFinite        = errors.New("result is undefined or exceeds the representable range")
	ErrInvalidOperand   = errors.New("operands must be finite numbers")
	ErrUnknownOperation = errors.New("unknown operation")
	ErrOperandCount     = errors.New("wrong number of operands")
)

// Add returns a + b.
func Add(a, b float64) (float64, error) {
	return finite(a + b)
}

// Subtract returns a - b.
func Subtract(a, b float64) (float64, error) {
	return finite(a - b)
}

// Multiply returns a * b.
func Multiply(a, b float64) (float64, error) {
	return finite(a * b)
}

// Divide returns a / b, or ErrDivisionByZero when b is zero.
func Divide(a, b float64) (float64, error) {
	if b == 0 {
		return 0, ErrDivisionByZero
	}
	return finite(a / b)
}

// Power returns base raised to exponent. Results that are not real numbers
// (e.g. a fractional power of a negative base) or that overflow yield
// ErrNonFinite.
func Power(base, exponent float64) (float64, error) {
	return finite(math.Pow(base, exponent))
}

// Sqrt returns the square root of a, or ErrNegativeSqrt when a is negative.
func Sqrt(a float64) (float64, error) {
	if a < 0 {
		return 0, ErrNegativeSqrt
	}
	return finite(math.Sqrt(a))
}

// Percentage returns percent% of value, i.e. percent / 100 * value.
//
// The multiplication is performed before the division because it keeps
// integer-valued inputs exact more often (7% of 3 is 0.21, not
// 0.21000000000000002).
func Percentage(percent, value float64) (float64, error) {
	return finite(percent * value / 100)
}

// finite rejects NaN and ±Inf and normalises negative zero, which would
// otherwise be serialised as "-0".
func finite(x float64) (float64, error) {
	if math.IsNaN(x) || math.IsInf(x, 0) {
		return 0, ErrNonFinite
	}
	if x == 0 {
		return 0, nil
	}
	return x, nil
}

// operation adapts a concrete function to a uniform, arity-checked signature.
type operation struct {
	arity int
	apply func(operands []float64) (float64, error)
}

func binary(fn func(a, b float64) (float64, error)) operation {
	return operation{arity: 2, apply: func(o []float64) (float64, error) { return fn(o[0], o[1]) }}
}

func unary(fn func(a float64) (float64, error)) operation {
	return operation{arity: 1, apply: func(o []float64) (float64, error) { return fn(o[0]) }}
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
	"sqrt":       unary(Sqrt),
}

// Arity reports how many operands the named operation expects and whether the
// operation exists.
func Arity(name string) (int, bool) {
	op, ok := registry[name]
	return op.arity, ok
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

// Calculate runs the named operation against the given operands after
// validating the operation name, the operand count and that every operand is
// finite.
func Calculate(name string, operands ...float64) (float64, error) {
	op, ok := registry[name]
	if !ok {
		return 0, ErrUnknownOperation
	}
	if len(operands) != op.arity {
		return 0, ErrOperandCount
	}
	for _, x := range operands {
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return 0, ErrInvalidOperand
		}
	}
	return op.apply(operands)
}
