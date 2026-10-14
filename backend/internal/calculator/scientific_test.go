package calculator

import (
	"errors"
	"testing"
	"time"

	"github.com/cockroachdb/apd/v3"
)

func TestScientificOperations(t *testing.T) {
	cases := []struct {
		name    string
		op      string
		unit    AngleUnit
		args    []string
		want    string
		wantErr error
	}{
		{name: "sin 30°", op: "sin", unit: Degrees, args: []string{"30"}, want: "0.5"},
		{name: "sin 90°", op: "sin", unit: Degrees, args: []string{"90"}, want: "1"},
		{name: "sin 180° is exactly zero", op: "sin", unit: Degrees, args: []string{"180"}, want: "0"},
		{name: "sin −30°", op: "sin", unit: Degrees, args: []string{"-30"}, want: "-0.5"},
		{name: "sin 390° wraps", op: "sin", unit: Degrees, args: []string{"390"}, want: "0.5"},
		{name: "cos 60°", op: "cos", unit: Degrees, args: []string{"60"}, want: "0.5"},
		{name: "cos 90° is exactly zero", op: "cos", unit: Degrees, args: []string{"90"}, want: "0"},
		{name: "cos 180°", op: "cos", unit: Degrees, args: []string{"180"}, want: "-1"},
		{name: "tan 45°", op: "tan", unit: Degrees, args: []string{"45"}, want: "1"},
		{name: "tan 135°", op: "tan", unit: Degrees, args: []string{"135"}, want: "-1"},
		{name: "tan 90° is undefined", op: "tan", unit: Degrees, args: []string{"90"}, wantErr: ErrTangentUndefined},
		{name: "tan −270° is undefined", op: "tan", unit: Degrees, args: []string{"-270"}, wantErr: ErrTangentUndefined},
		{name: "huge degree argument reduces exactly", op: "sin", unit: Degrees, args: []string{"1e39"}, want: "-0.984807753012208059366743024589523"},

		{name: "sin 1", op: "sin", unit: Radians, args: []string{"1"}, want: "0.841470984807896506652502321630299"},
		{name: "cos 1", op: "cos", unit: Radians, args: []string{"1"}, want: "0.5403023058681397174009366074429766"},
		{name: "tan 1", op: "tan", unit: Radians, args: []string{"1"}, want: "1.55740772465490223050697480745836"},
		{name: "radians is the default", op: "sin", args: []string{"1"}, want: "0.841470984807896506652502321630299"},
		{name: "sin of 34-digit π is its tiny true value", op: "sin", unit: Radians, args: []string{"3.141592653589793238462643383279503"}, want: "-1.158028306006248941790250554076922e-34"},
		{name: "cos 0", op: "cos", unit: Radians, args: []string{"0"}, want: "1"},
		{name: "small angle", op: "sin", unit: Radians, args: []string{"1e-30"}, want: "1e-30"},
		{name: "argument too large", op: "sin", unit: Radians, args: []string{"1e41"}, wantErr: ErrArgumentTooLarge},

		{name: "ln 10", op: "ln", args: []string{"10"}, want: "2.302585092994045684017991454684364"},
		{name: "log 1000", op: "log", args: []string{"1000"}, want: "3"},
		{name: "log 2", op: "log", args: []string{"2"}, want: "0.301029995663981195213738894724493"},
		{name: "ln 0", op: "ln", args: []string{"0"}, wantErr: ErrLogDomain},
		{name: "log of negative", op: "log", args: []string{"-1"}, wantErr: ErrLogDomain},
		{name: "exp 1 is e", op: "exp", args: []string{"1"}, want: "2.718281828459045235360287471352662"},
		{name: "exp 0", op: "exp", args: []string{"0"}, want: "1"},
		{name: "exp overflow", op: "exp", args: []string{"100000"}, wantErr: ErrOutOfRange},
		{name: "exp underflow", op: "exp", args: []string{"-100000"}, wantErr: ErrOutOfRange},

		{name: "0!", op: "factorial", args: []string{"0"}, want: "1"},
		{name: "20!", op: "factorial", args: []string{"20"}, want: "2432902008176640000"},
		{name: "170! rounds to 34 digits", op: "factorial", args: []string{"170"}, want: "7.257415615307998967396728211129257e+306"},
		{name: "largest factorial", op: "factorial", args: []string{"2000"}, want: "3.316275092450633241175393380576354e+5735"},
		{name: "factorial too large", op: "factorial", args: []string{"2001"}, wantErr: ErrOutOfRange},
		{name: "factorial of fraction", op: "factorial", args: []string{"3.5"}, wantErr: ErrFactorialDomain},
		{name: "factorial of negative", op: "factorial", args: []string{"-1"}, wantErr: ErrFactorialDomain},

		{name: "mod", op: "mod", args: []string{"10", "3"}, want: "1"},
		{name: "mod keeps the dividend's sign", op: "mod", args: []string{"-10", "3"}, want: "-1"},
		{name: "decimal mod", op: "mod", args: []string{"5.5", "2"}, want: "1.5"},
		{name: "mod with a huge quotient is exact", op: "mod", args: []string{"1e40", "3"}, want: "1"},
		{name: "mod by zero", op: "mod", args: []string{"1", "0"}, wantErr: ErrDivisionByZero},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			operands := make([]*apd.Decimal, len(tc.args))
			for i, a := range tc.args {
				operands[i] = mustParse(t, a)
			}
			got, err := Calculate(tc.op, Options{AngleUnit: tc.unit}, operands...)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error = %v, want %v", err, tc.wantErr)
			}
			if err == nil && Format(got) != tc.want {
				t.Errorf("got %s, want %s", Format(got), tc.want)
			}
		})
	}
}

func TestConstants(t *testing.T) {
	if got := Format(Pi()); got != "3.141592653589793238462643383279503" {
		t.Errorf("Pi() = %s", got)
	}
	if got := Format(E()); got != "2.718281828459045235360287471352662" {
		t.Errorf("E() = %s", got)
	}
}

func TestParseAngleUnit(t *testing.T) {
	for in, want := range map[string]AngleUnit{"": Radians, "rad": Radians, "deg": Degrees} {
		if got, err := ParseAngleUnit(in); err != nil || got != want {
			t.Errorf("ParseAngleUnit(%q) = %q, %v", in, got, err)
		}
	}
	if _, err := ParseAngleUnit("grad"); !errors.Is(err, ErrInvalidAngleUnit) {
		t.Errorf("ParseAngleUnit(grad) error = %v", err)
	}
}

func TestUsesAngleUnit(t *testing.T) {
	for _, op := range []string{"sin", "cos", "tan"} {
		if !UsesAngleUnit(op) {
			t.Errorf("%s should use the angle unit", op)
		}
	}
	for _, op := range []string{"add", "ln", "nope"} {
		if UsesAngleUnit(op) {
			t.Errorf("%s should not use the angle unit", op)
		}
	}
}

func TestWorstCasesAreCheap(t *testing.T) {
	cases := []struct {
		op   string
		args []string
	}{
		{"factorial", []string{"2000"}},
		{"mod", []string{"9.999999999999999999999999999999999e6144", "1e-6143"}},
		{"sin", []string{"9.999999999999999999999999999999999e39"}},
		{"exp", []string{"9e6144"}},
		{"ln", []string{"9e6144"}},
		{"power", []string{"1.000000000000000000000000000000001", "9e6144"}},
	}
	for _, tc := range cases {
		operands := []*apd.Decimal{}
		for _, a := range tc.args {
			operands = append(operands, mustParse(t, a))
		}
		start := time.Now()
		_, _ = Calculate(tc.op, Options{}, operands...)
		if elapsed := time.Since(start); elapsed > 100*time.Millisecond {
			t.Errorf("%s%v took %v", tc.op, tc.args, elapsed)
		}
	}
}
