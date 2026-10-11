package calculator

import (
	"errors"
	"math"
	"slices"
	"testing"
)

type binaryCase struct {
	name    string
	a, b    float64
	want    float64
	wantErr error
}

func runBinary(t *testing.T, fn func(a, b float64) (float64, error), cases []binaryCase) {
	t.Helper()
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := fn(tc.a, tc.b)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error = %v, want %v", err, tc.wantErr)
			}
			if err == nil && !almostEqual(got, tc.want) {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func almostEqual(a, b float64) bool {
	if a == b {
		return true
	}
	return math.Abs(a-b) <= 1e-12*math.Max(math.Abs(a), math.Abs(b))
}

func TestAdd(t *testing.T) {
	runBinary(t, Add, []binaryCase{
		{name: "positives", a: 2, b: 3, want: 5},
		{name: "negatives", a: -2, b: -3, want: -5},
		{name: "mixed signs", a: -2, b: 3, want: 1},
		{name: "decimals", a: 0.1, b: 0.2, want: 0.3},
		{name: "zero identity", a: 42, b: 0, want: 42},
		{name: "overflow", a: math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrNonFinite},
	})
}

func TestSubtract(t *testing.T) {
	runBinary(t, Subtract, []binaryCase{
		{name: "positives", a: 10, b: 4, want: 6},
		{name: "negative result", a: 4, b: 10, want: -6},
		{name: "negatives", a: -4, b: -10, want: 6},
		{name: "decimals", a: 1.5, b: 0.25, want: 1.25},
		{name: "overflow", a: -math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrNonFinite},
	})
}

func TestMultiply(t *testing.T) {
	runBinary(t, Multiply, []binaryCase{
		{name: "positives", a: 6, b: 7, want: 42},
		{name: "by zero", a: 6, b: 0, want: 0},
		{name: "negative by zero is positive zero", a: -6, b: 0, want: 0},
		{name: "mixed signs", a: -6, b: 7, want: -42},
		{name: "decimals", a: 0.5, b: 0.5, want: 0.25},
		{name: "overflow", a: 1e308, b: 10, wantErr: ErrNonFinite},
	})
}

func TestDivide(t *testing.T) {
	runBinary(t, Divide, []binaryCase{
		{name: "exact", a: 10, b: 2, want: 5},
		{name: "fraction", a: 1, b: 4, want: 0.25},
		{name: "repeating", a: 1, b: 3, want: 1.0 / 3},
		{name: "negative divisor", a: 10, b: -2, want: -5},
		{name: "zero dividend", a: 0, b: 5, want: 0},
		{name: "by zero", a: 10, b: 0, wantErr: ErrDivisionByZero},
		{name: "zero by zero", a: 0, b: 0, wantErr: ErrDivisionByZero},
		{name: "overflow", a: 1e308, b: 1e-308, wantErr: ErrNonFinite},
	})
}

func TestPower(t *testing.T) {
	runBinary(t, Power, []binaryCase{
		{name: "integer", a: 2, b: 10, want: 1024},
		{name: "zero exponent", a: 5, b: 0, want: 1},
		{name: "negative exponent", a: 2, b: -2, want: 0.25},
		{name: "fractional exponent", a: 9, b: 0.5, want: 3},
		{name: "negative base odd exponent", a: -2, b: 3, want: -8},
		{name: "negative base fractional exponent", a: -8, b: 0.5, wantErr: ErrNonFinite},
		{name: "zero to negative power", a: 0, b: -1, wantErr: ErrNonFinite},
		{name: "overflow", a: 10, b: 309, wantErr: ErrNonFinite},
	})
}

func TestPercentage(t *testing.T) {
	runBinary(t, Percentage, []binaryCase{
		{name: "ten percent", a: 10, b: 200, want: 20},
		{name: "exact for small integers", a: 7, b: 3, want: 0.21},
		{name: "over one hundred", a: 150, b: 40, want: 60},
		{name: "negative percent", a: -10, b: 50, want: -5},
		{name: "of one", a: 25, b: 1, want: 0.25},
		{name: "overflow", a: math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrNonFinite},
	})
}

func TestSqrt(t *testing.T) {
	cases := []struct {
		name    string
		a       float64
		want    float64
		wantErr error
	}{
		{name: "perfect square", a: 144, want: 12},
		{name: "irrational", a: 2, want: math.Sqrt2},
		{name: "zero", a: 0, want: 0},
		{name: "fraction", a: 0.25, want: 0.5},
		{name: "negative", a: -4, wantErr: ErrNegativeSqrt},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Sqrt(tc.a)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error = %v, want %v", err, tc.wantErr)
			}
			if err == nil && !almostEqual(got, tc.want) {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestResultsNeverNegativeZero(t *testing.T) {
	got, err := Multiply(-1, 0)
	if err != nil {
		t.Fatal(err)
	}
	if math.Signbit(got) {
		t.Errorf("got -0, want +0")
	}
}

func TestCalculate(t *testing.T) {
	cases := []struct {
		name     string
		op       string
		operands []float64
		want     float64
		wantErr  error
	}{
		{name: "add", op: "add", operands: []float64{1, 2}, want: 3},
		{name: "subtract", op: "subtract", operands: []float64{1, 2}, want: -1},
		{name: "multiply", op: "multiply", operands: []float64{3, 4}, want: 12},
		{name: "divide", op: "divide", operands: []float64{8, 4}, want: 2},
		{name: "power", op: "power", operands: []float64{3, 2}, want: 9},
		{name: "percentage", op: "percentage", operands: []float64{50, 8}, want: 4},
		{name: "sqrt", op: "sqrt", operands: []float64{81}, want: 9},
		{name: "domain error propagates", op: "divide", operands: []float64{1, 0}, wantErr: ErrDivisionByZero},
		{name: "unknown operation", op: "modulo", operands: []float64{1, 2}, wantErr: ErrUnknownOperation},
		{name: "names are case sensitive", op: "ADD", operands: []float64{1, 2}, wantErr: ErrUnknownOperation},
		{name: "too few operands", op: "add", operands: []float64{1}, wantErr: ErrOperandCount},
		{name: "too many operands", op: "sqrt", operands: []float64{1, 2}, wantErr: ErrOperandCount},
		{name: "no operands", op: "add", wantErr: ErrOperandCount},
		{name: "NaN operand", op: "add", operands: []float64{math.NaN(), 1}, wantErr: ErrInvalidOperand},
		{name: "infinite operand", op: "sqrt", operands: []float64{math.Inf(1)}, wantErr: ErrInvalidOperand},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Calculate(tc.op, tc.operands...)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error = %v, want %v", err, tc.wantErr)
			}
			if err == nil && !almostEqual(got, tc.want) {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestArity(t *testing.T) {
	cases := []struct {
		op        string
		wantArity int
		wantOK    bool
	}{
		{op: "add", wantArity: 2, wantOK: true},
		{op: "percentage", wantArity: 2, wantOK: true},
		{op: "sqrt", wantArity: 1, wantOK: true},
		{op: "nope", wantArity: 0, wantOK: false},
	}
	for _, tc := range cases {
		t.Run(tc.op, func(t *testing.T) {
			arity, ok := Arity(tc.op)
			if arity != tc.wantArity || ok != tc.wantOK {
				t.Errorf("Arity(%q) = (%d, %v), want (%d, %v)", tc.op, arity, ok, tc.wantArity, tc.wantOK)
			}
		})
	}
}

func TestOperations(t *testing.T) {
	want := []string{"add", "divide", "multiply", "percentage", "power", "sqrt", "subtract"}
	if got := Operations(); !slices.Equal(got, want) {
		t.Errorf("Operations() = %v, want %v", got, want)
	}
}
