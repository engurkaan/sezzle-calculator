package calculator

import (
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/cockroachdb/apd/v3"
)

func mustParse(t *testing.T, s string) *apd.Decimal {
	t.Helper()
	d, err := Parse(s)
	if err != nil {
		t.Fatalf("Parse(%q): %v", s, err)
	}
	return d
}

type binaryCase struct {
	name    string
	a, b    string
	want    string
	wantErr error
}

func runBinary(t *testing.T, fn func(a, b *apd.Decimal) (*apd.Decimal, error), cases []binaryCase) {
	t.Helper()
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := fn(mustParse(t, tc.a), mustParse(t, tc.b))
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error = %v, want %v", err, tc.wantErr)
			}
			if err == nil && Format(got) != tc.want {
				t.Errorf("got %s, want %s", Format(got), tc.want)
			}
		})
	}
}

func TestAdd(t *testing.T) {
	runBinary(t, Add, []binaryCase{
		{name: "integers", a: "2", b: "3", want: "5"},
		{name: "negatives", a: "-2", b: "-3", want: "-5"},
		{name: "decimals are exact", a: "0.1", b: "0.2", want: "0.3"},
		{name: "money", a: "19.99", b: "0.01", want: "20"},
		{name: "beyond float64 precision", a: "9007199254740993", b: "1", want: "9007199254740994"},
		{name: "34 digits", a: "1234567890123456789012345678901233", b: "1", want: "1234567890123456789012345678901234"},
		{name: "rounds beyond 34 digits", a: "1e40", b: "1", want: "1e+40"},
		{name: "overflow", a: "9e6144", b: "9e6144", wantErr: ErrOutOfRange},
	})
}

func TestSubtract(t *testing.T) {
	runBinary(t, Subtract, []binaryCase{
		{name: "integers", a: "10", b: "4", want: "6"},
		{name: "negative result", a: "4", b: "10", want: "-6"},
		{name: "decimals are exact", a: "0.3", b: "0.1", want: "0.2"},
		{name: "exact zero", a: "0.30", b: "0.3", want: "0"},
		{name: "underflow", a: "1.1e-6143", b: "1e-6143", wantErr: ErrOutOfRange},
	})
}

func TestMultiply(t *testing.T) {
	runBinary(t, Multiply, []binaryCase{
		{name: "integers", a: "6", b: "7", want: "42"},
		{name: "by zero", a: "6", b: "0", want: "0"},
		{name: "negative zero is normalised", a: "-6", b: "0", want: "0"},
		{name: "decimals are exact", a: "1.1", b: "1.1", want: "1.21"},
		{name: "money", a: "33.33", b: "3", want: "99.99"},
		{name: "large", a: "123456789", b: "1000", want: "123456789000"},
		{name: "overflow", a: "1e6000", b: "1e6000", wantErr: ErrOutOfRange},
	})
}

func TestDivide(t *testing.T) {
	runBinary(t, Divide, []binaryCase{
		{name: "exact", a: "10", b: "4", want: "2.5"},
		{name: "one third rounds to 34 digits", a: "1", b: "3", want: "0.3333333333333333333333333333333333"},
		{name: "rounds half even", a: "2", b: "3", want: "0.6666666666666666666666666666666667"},
		{name: "money split", a: "100", b: "8", want: "12.5"},
		{name: "small result", a: "1", b: "1e8", want: "1e-8"},
		{name: "negative divisor", a: "10", b: "-2", want: "-5"},
		{name: "zero dividend", a: "0", b: "5", want: "0"},
		{name: "by zero", a: "10", b: "0", wantErr: ErrDivisionByZero},
		{name: "zero by zero", a: "0", b: "0", wantErr: ErrDivisionByZero},
		{name: "underflow", a: "1e-6000", b: "1e6000", wantErr: ErrOutOfRange},
	})
}

func TestPower(t *testing.T) {
	runBinary(t, Power, []binaryCase{
		{name: "integer", a: "2", b: "10", want: "1024"},
		{name: "decimal base", a: "1.1", b: "2", want: "1.21"},
		{name: "zero exponent", a: "5", b: "0", want: "1"},
		{name: "zero to zero", a: "0", b: "0", want: "1"},
		{name: "negative exponent", a: "2", b: "-2", want: "0.25"},
		{name: "fractional exponent", a: "2", b: "0.5", want: "1.414213562373095048801688724209698"},
		{name: "negative base odd exponent", a: "-2", b: "3", want: "-8"},
		{name: "negative base fractional exponent", a: "-8", b: "0.5", wantErr: ErrNonReal},
		{name: "zero to negative power", a: "0", b: "-1", wantErr: ErrDivisionByZero},
		{name: "overflow", a: "10", b: "6145", wantErr: ErrOutOfRange},
		{name: "huge exponent stays cheap", a: "1.0000001", b: "1e30", wantErr: ErrOutOfRange},
		{name: "underflow", a: "0.5", b: "1e6143", wantErr: ErrOutOfRange},
	})
}

func TestPercentage(t *testing.T) {
	runBinary(t, Percentage, []binaryCase{
		{name: "ten percent", a: "10", b: "200", want: "20"},
		{name: "exact", a: "7", b: "3", want: "0.21"},
		{name: "sales tax", a: "8.875", b: "59.99", want: "5.3241125"},
		{name: "over one hundred", a: "150", b: "40", want: "60"},
		{name: "negative percent", a: "-10", b: "50", want: "-5"},
		{name: "overflow", a: "9e6144", b: "9e6144", wantErr: ErrOutOfRange},
	})
}

func TestSqrt(t *testing.T) {
	cases := []struct {
		name    string
		a       string
		want    string
		wantErr error
	}{
		{name: "perfect square", a: "144", want: "12"},
		{name: "irrational", a: "2", want: "1.414213562373095048801688724209698"},
		{name: "zero", a: "0", want: "0"},
		{name: "fraction", a: "0.25", want: "0.5"},
		{name: "negative", a: "-4", wantErr: ErrNegativeSqrt},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Sqrt(mustParse(t, tc.a))
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error = %v, want %v", err, tc.wantErr)
			}
			if err == nil && Format(got) != tc.want {
				t.Errorf("got %s, want %s", Format(got), tc.want)
			}
		})
	}
}

func TestParse(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantErr error
	}{
		{in: "42", want: "42"},
		{in: "-3.50", want: "-3.5"},
		{in: "+3", want: "3"},
		{in: ".5", want: "0.5"},
		{in: "5.", want: "5"},
		{in: "-0", want: "0"},
		{in: "1e-7", want: "1e-7"},
		{in: "1E3", want: "1000"},
		{in: "1234567890123456789012345678901234", want: "1234567890123456789012345678901234"},
		{in: "1" + strings.Repeat("0", 40), want: "1e+40"},
		{in: "12345678901234567890123456789012345", wantErr: ErrTooManyDigits},
		{in: "1e7000", wantErr: ErrOperandRange},
		{in: "1e-7000", wantErr: ErrOperandRange},
		{in: "", wantErr: ErrInvalidNumber},
		{in: "NaN", wantErr: ErrInvalidNumber},
		{in: "Infinity", wantErr: ErrInvalidNumber},
		{in: "0x10", wantErr: ErrInvalidNumber},
		{in: " 1", wantErr: ErrInvalidNumber},
		{in: "1,000", wantErr: ErrInvalidNumber},
		{in: "1e99999999999999999999", wantErr: ErrInvalidNumber},
		{in: strings.Repeat("1", maxInputLength+1), wantErr: ErrInvalidNumber},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got, err := Parse(tc.in)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error = %v, want %v", err, tc.wantErr)
			}
			if err == nil && Format(got) != tc.want {
				t.Errorf("got %s, want %s", Format(got), tc.want)
			}
		})
	}
}

func TestFormat(t *testing.T) {
	cases := map[string]string{
		"0":         "0",
		"0.000":     "0",
		"12.500":    "12.5",
		"1e3":       "1000",
		"0.0000001": "1e-7",
		"0.000001":  "0.000001",
		"1e33":      "1000000000000000000000000000000000",
		"1e34":      "1e+34",
		"-2.5e100":  "-2.5e+100",
	}
	for in, want := range cases {
		d, _, err := apd.NewFromString(in)
		if err != nil {
			t.Fatal(err)
		}
		if got := Format(d); got != want {
			t.Errorf("Format(%s) = %s, want %s", in, got, want)
		}
	}
}

func TestCalculate(t *testing.T) {
	cases := []struct {
		name     string
		op       string
		operands []string
		want     string
		wantErr  error
	}{
		{name: "add", op: "add", operands: []string{"1", "2"}, want: "3"},
		{name: "subtract", op: "subtract", operands: []string{"1", "2"}, want: "-1"},
		{name: "multiply", op: "multiply", operands: []string{"3", "4"}, want: "12"},
		{name: "divide", op: "divide", operands: []string{"8", "4"}, want: "2"},
		{name: "power", op: "power", operands: []string{"3", "2"}, want: "9"},
		{name: "percentage", op: "percentage", operands: []string{"50", "8"}, want: "4"},
		{name: "sqrt", op: "sqrt", operands: []string{"81"}, want: "9"},
		{name: "domain error propagates", op: "divide", operands: []string{"1", "0"}, wantErr: ErrDivisionByZero},
		{name: "unknown operation", op: "modulo", operands: []string{"1", "2"}, wantErr: ErrUnknownOperation},
		{name: "names are case sensitive", op: "ADD", operands: []string{"1", "2"}, wantErr: ErrUnknownOperation},
		{name: "too few operands", op: "add", operands: []string{"1"}, wantErr: ErrOperandCount},
		{name: "too many operands", op: "sqrt", operands: []string{"1", "2"}, wantErr: ErrOperandCount},
		{name: "no operands", op: "add", wantErr: ErrOperandCount},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			operands := make([]*apd.Decimal, len(tc.operands))
			for i, s := range tc.operands {
				operands[i] = mustParse(t, s)
			}
			got, err := Calculate(tc.op, Options{}, operands...)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error = %v, want %v", err, tc.wantErr)
			}
			if err == nil && Format(got) != tc.want {
				t.Errorf("got %s, want %s", Format(got), tc.want)
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
	want := []string{
		"add", "cos", "divide", "exp", "factorial", "ln", "log", "mod",
		"multiply", "percentage", "power", "sin", "sqrt", "subtract", "tan",
	}
	if got := Operations(); !slices.Equal(got, want) {
		t.Errorf("Operations() = %v, want %v", got, want)
	}
}

func TestConcurrentUse(t *testing.T) {
	t.Parallel()
	base, exponent := mustParse(t, "1.5"), mustParse(t, "2.5")
	done := make(chan struct{})
	for range 8 {
		go func() {
			defer func() { done <- struct{}{} }()
			for range 200 {
				if _, err := Calculate("power", Options{}, base, exponent); err != nil {
					t.Error(err)
				}
			}
		}()
	}
	for range 8 {
		<-done
	}
}
