package calculator

import (
	"errors"
	"strings"
	"testing"
)

func TestEvaluate(t *testing.T) {
	cases := []struct {
		expr string
		unit AngleUnit
		want string
	}{
		{expr: "7+3*2", want: "13"},
		{expr: "(7+3)*2", want: "20"},
		{expr: "2+3*4-1", want: "13"},
		{expr: "10-4-3", want: "3"},
		{expr: "100/10/5", want: "2"},
		{expr: "2^3^2", want: "512"},
		{expr: "-2^2", want: "-4"},
		{expr: "(-2)^2", want: "4"},
		{expr: "2^-1", want: "0.5"},
		{expr: "2*-3", want: "-6"},
		{expr: "--5", want: "5"},
		{expr: "+5", want: "5"},
		{expr: "10 mod 4 * 2", want: "4"},
		{expr: "1 + 10 mod 4", want: "3"},

		{expr: "0.1+0.2", want: "0.3"},
		{expr: "0.1*3-0.3", want: "0"},
		{expr: "1/3*3", want: "0.9999999999999999999999999999999999"},
		{expr: "1.5e3 + .5", want: "1500.5"},

		{expr: "5!", want: "120"},
		{expr: "3!!", want: "720"},
		{expr: "2*3!", want: "12"},
		{expr: "50%", want: "0.5"},
		{expr: "200+10%", want: "220"},
		{expr: "200-10%", want: "180"},
		{expr: "200*10%", want: "20"},
		{expr: "(100+50)+10%", want: "165"},

		{expr: "sqrt(144)", want: "12"},
		{expr: "sqrt(9)+sqrt(16)", want: "7"},
		{expr: "abs(-3.5)", want: "3.5"},
		// e is rounded to 34 digits (…352662 < …35266249…), so its logarithm is
		// correctly a hair below 1. The UI displays 20 digits: "1".
		{expr: "ln(e)", want: "0.9999999999999999999999999999999998"},
		{expr: "ln(exp(2))", want: "2"},
		{expr: "log(1000)", want: "3"},
		{expr: "exp(0)", want: "1"},
		{expr: "2*pi", want: "6.283185307179586476925286766559006"},
		{expr: "sin(30)", unit: Degrees, want: "0.5"},
		{expr: "sin(pi/2)", want: "1"},
		{expr: "cos(60)+sin(30)", unit: Degrees, want: "1"},
		{expr: "SIN(90)", unit: Degrees, want: "1"},

		{expr: "  ( ( 1 + 2 ) * ( 3 + 4 ) )  ", want: "21"},
	}
	for _, tc := range cases {
		t.Run(tc.expr, func(t *testing.T) {
			got, err := Evaluate(tc.expr, Options{AngleUnit: tc.unit})
			if err != nil {
				t.Fatalf("Evaluate(%q): %v", tc.expr, err)
			}
			if Format(got) != tc.want {
				t.Errorf("Evaluate(%q) = %s, want %s", tc.expr, Format(got), tc.want)
			}
		})
	}
}

func TestEvaluateDomainErrors(t *testing.T) {
	cases := []struct {
		expr    string
		unit    AngleUnit
		wantErr error
	}{
		{expr: "1/0", wantErr: ErrDivisionByZero},
		{expr: "1/(2-2)", wantErr: ErrDivisionByZero},
		{expr: "sqrt(-4)", wantErr: ErrNegativeSqrt},
		{expr: "(-8)^0.5", wantErr: ErrNonReal},
		{expr: "ln(0)", wantErr: ErrLogDomain},
		{expr: "2.5!", wantErr: ErrFactorialDomain},
		{expr: "tan(90)", unit: Degrees, wantErr: ErrTangentUndefined},
		{expr: "10^7000", wantErr: ErrOutOfRange},
		{expr: "5 mod 0", wantErr: ErrDivisionByZero},

		{expr: "-(1/0)", wantErr: ErrDivisionByZero},
		{expr: "(1/0)!", wantErr: ErrDivisionByZero},
		{expr: "(1/0)%", wantErr: ErrDivisionByZero},
		{expr: "(1/0)+1", wantErr: ErrDivisionByZero},
		{expr: "1+(1/0)", wantErr: ErrDivisionByZero},
		{expr: "1+(1/0)%", wantErr: ErrDivisionByZero},
		{expr: "(9e6144)+(9e6144)%", wantErr: ErrOutOfRange},
		{expr: "sqrt(1/0)", wantErr: ErrDivisionByZero},
		{expr: "cos(1e41)", wantErr: ErrArgumentTooLarge},
		{expr: "tan(1e41)", wantErr: ErrArgumentTooLarge},
	}
	for _, tc := range cases {
		t.Run(tc.expr, func(t *testing.T) {
			_, err := Evaluate(tc.expr, Options{AngleUnit: tc.unit})
			if !errors.Is(err, tc.wantErr) {
				t.Errorf("Evaluate(%q) error = %v, want %v", tc.expr, err, tc.wantErr)
			}
		})
	}
}

func TestEvaluateSyntaxErrors(t *testing.T) {
	cases := []struct {
		expr         string
		wantMessage  string
		wantPosition int
	}{
		{expr: "", wantMessage: "unexpected end of expression", wantPosition: 1},
		{expr: "1+", wantMessage: "unexpected end of expression", wantPosition: 3},
		{expr: "1+*2", wantMessage: `unexpected "*"`, wantPosition: 3},
		{expr: "(1+2", wantMessage: "missing closing parenthesis", wantPosition: 5},
		{expr: "1+2)", wantMessage: `unexpected ")"`, wantPosition: 4},
		{expr: "()", wantMessage: `unexpected ")"`, wantPosition: 2},
		{expr: "2 3", wantMessage: `unexpected "3"`, wantPosition: 3},
		{expr: "2pi", wantMessage: `unexpected "pi"`, wantPosition: 2},
		{expr: "1 # 2", wantMessage: `unexpected character '#'`, wantPosition: 3},
		{expr: "foo(2)", wantMessage: `unknown name "foo"`, wantPosition: 1},
		{expr: "sin 30", wantMessage: `expected "(" after sin`, wantPosition: 5},
		{expr: "sqrt(4", wantMessage: "missing closing parenthesis", wantPosition: 7},
		{expr: "1.2.3", wantMessage: `invalid number "1.2.3"`, wantPosition: 1},
		{expr: "1 + 12345678901234567890123456789012345", wantMessage: "number has more than 34 significant digits", wantPosition: 5},
		{expr: "1e7000", wantMessage: "number is out of range", wantPosition: 1},
		{expr: "mod 3", wantMessage: `unknown name "mod"`, wantPosition: 1},
		{expr: strings.Repeat("(", 70) + "1" + strings.Repeat(")", 70), wantMessage: "expression is nested too deeply"},
		{expr: strings.Repeat("-", 70) + "1", wantMessage: "expression is nested too deeply"},
		{expr: strings.Repeat("2^", 70) + "1", wantMessage: "expression is nested too deeply"},
		{expr: strings.Repeat("1+", MaxExpressionLength) + "1", wantMessage: "expression is longer than 1000 characters"},
	}
	for _, tc := range cases {
		name := tc.expr
		if len(name) > 40 {
			name = name[:40] + "…"
		}
		t.Run(name, func(t *testing.T) {
			_, err := Evaluate(tc.expr, Options{})
			if !errors.Is(err, ErrInvalidExpression) {
				t.Fatalf("error = %v, want a syntax error", err)
			}
			var syntaxErr *SyntaxError
			if !errors.As(err, &syntaxErr) {
				t.Fatalf("error %v is not a *SyntaxError", err)
			}
			if syntaxErr.Message != tc.wantMessage {
				t.Errorf("message = %q, want %q", syntaxErr.Message, tc.wantMessage)
			}
			if tc.wantPosition != 0 && syntaxErr.Position != tc.wantPosition {
				t.Errorf("position = %d, want %d", syntaxErr.Position, tc.wantPosition)
			}
			if !strings.Contains(err.Error(), "at position") {
				t.Errorf("Error() = %q, want it to mention the position", err.Error())
			}
		})
	}
}
