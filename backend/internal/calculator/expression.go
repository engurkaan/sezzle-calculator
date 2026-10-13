package calculator

import (
	"errors"
	"fmt"
	"strings"
	"unicode"

	"github.com/cockroachdb/apd/v3"
)

// Expression grammar, lowest to highest precedence:
//
//	expression = term { ("+" | "-") term }
//	term       = unary { ("*" | "/" | "mod") unary }
//	unary      = ("-" | "+") unary | power
//	power      = postfix [ "^" unary ]            (right-associative)
//	postfix    = primary { "!" | "%" }
//	primary    = number | "pi" | "e" | function "(" expression ")" | "(" expression ")"
//	function   = "sqrt" | "sin" | "cos" | "tan" | "ln" | "log" | "exp" | "abs"
//
// So 7 + 3 * 2 = 13, 2 ^ 3 ^ 2 = 512 and -2 ^ 2 = -4, as in mathematics.
// "a + b%" and "a - b%" mean "a plus/minus b percent of a" (200 + 10% = 220);
// anywhere else b% is b/100.

// Limits that keep a single request cheap to parse and evaluate.
const (
	MaxExpressionLength = 1000
	maxNestingDepth     = 64
)

// ErrInvalidExpression is the sentinel wrapped by every syntax error.
var ErrInvalidExpression = errors.New("invalid expression")

// SyntaxError describes where an expression could not be parsed.
type SyntaxError struct {
	// Position is the 1-based character offset of the problem.
	Position int
	Message  string
}

func (e *SyntaxError) Error() string {
	return fmt.Sprintf("%s at position %d", e.Message, e.Position)
}

func (e *SyntaxError) Unwrap() error { return ErrInvalidExpression }

// Evaluate parses and evaluates an arithmetic expression. Syntax errors wrap
// ErrInvalidExpression; evaluation errors are the usual domain errors.
func Evaluate(expression string, opts Options) (*apd.Decimal, error) {
	tree, err := ParseExpression(expression)
	if err != nil {
		return nil, err
	}
	unit := opts.AngleUnit
	if unit == "" {
		unit = Radians
	}
	return tree.eval(unit)
}

// ParseExpression parses an expression into a syntax tree without
// evaluating it.
func ParseExpression(expression string) (Node, error) {
	if len(expression) > MaxExpressionLength {
		return nil, &SyntaxError{Position: MaxExpressionLength + 1, Message: fmt.Sprintf("expression is longer than %d characters", MaxExpressionLength)}
	}
	tokens, err := tokenize(expression)
	if err != nil {
		return nil, err
	}
	p := &parser{tokens: tokens}
	tree, err := p.expression()
	if err != nil {
		return nil, err
	}
	if t := p.peek(); t.kind != tokenEnd {
		return nil, p.unexpected(t)
	}
	return tree, nil
}

// --- Tokens ----------------------------------------------------------------

type tokenKind int

const (
	tokenEnd tokenKind = iota
	tokenNumber
	tokenIdent
	tokenOperator // + - * / ^ ! %
	tokenLParen
	tokenRParen
)

type token struct {
	kind tokenKind
	text string
	pos  int // 1-based
}

func tokenize(s string) ([]token, error) {
	var tokens []token
	runes := []rune(s)
	for i := 0; i < len(runes); {
		r := runes[i]
		pos := i + 1
		switch {
		case unicode.IsSpace(r):
			i++
		case unicode.IsDigit(r) || r == '.':
			end := scanNumber(runes, i)
			tokens = append(tokens, token{tokenNumber, string(runes[i:end]), pos})
			i = end
		case unicode.IsLetter(r):
			end := i
			for end < len(runes) && unicode.IsLetter(runes[end]) {
				end++
			}
			tokens = append(tokens, token{tokenIdent, strings.ToLower(string(runes[i:end])), pos})
			i = end
		case strings.ContainsRune("+-*/^!%", r):
			tokens = append(tokens, token{tokenOperator, string(r), pos})
			i++
		case r == '(':
			tokens = append(tokens, token{tokenLParen, "(", pos})
			i++
		case r == ')':
			tokens = append(tokens, token{tokenRParen, ")", pos})
			i++
		default:
			return nil, &SyntaxError{Position: pos, Message: fmt.Sprintf("unexpected character %q", r)}
		}
	}
	return append(tokens, token{kind: tokenEnd, pos: len(runes) + 1}), nil
}

// scanNumber returns the end of the number starting at i: digits, an
// optional fraction and an optional exponent ("1.5e-3"). An "e" not followed
// by digits is left alone so that it can be read as Euler's number.
func scanNumber(runes []rune, i int) int {
	isDigit := func(j int) bool { return j < len(runes) && unicode.IsDigit(runes[j]) }
	for isDigit(i) || (i < len(runes) && runes[i] == '.') {
		i++
	}
	if i < len(runes) && (runes[i] == 'e' || runes[i] == 'E') {
		j := i + 1
		if j < len(runes) && (runes[j] == '+' || runes[j] == '-') {
			j++
		}
		if isDigit(j) {
			for isDigit(j) {
				j++
			}
			return j
		}
	}
	return i
}

// --- Parser ----------------------------------------------------------------

type parser struct {
	tokens []token
	next   int
	depth  int
}

func (p *parser) peek() token { return p.tokens[p.next] }

func (p *parser) advance() token {
	t := p.tokens[p.next]
	if t.kind != tokenEnd {
		p.next++
	}
	return t
}

func (p *parser) isOperator(texts ...string) bool {
	t := p.peek()
	return (t.kind == tokenOperator || t.kind == tokenIdent) && contains(texts, t.text)
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func (p *parser) unexpected(t token) error {
	if t.kind == tokenEnd {
		return &SyntaxError{Position: t.pos, Message: "unexpected end of expression"}
	}
	return &SyntaxError{Position: t.pos, Message: fmt.Sprintf("unexpected %q", t.text)}
}

func (p *parser) enter() error {
	p.depth++
	if p.depth > maxNestingDepth {
		return &SyntaxError{Position: p.peek().pos, Message: "expression is nested too deeply"}
	}
	return nil
}

func (p *parser) leave() { p.depth-- }

func (p *parser) expression() (Node, error) {
	if err := p.enter(); err != nil {
		return nil, err
	}
	defer p.leave()

	left, err := p.term()
	if err != nil {
		return nil, err
	}
	for p.isOperator("+", "-") {
		op := p.advance().text
		right, err := p.term()
		if err != nil {
			return nil, err
		}
		left = &binaryNode{op: op, left: left, right: right}
	}
	return left, nil
}

func (p *parser) term() (Node, error) {
	left, err := p.unary()
	if err != nil {
		return nil, err
	}
	for p.isOperator("*", "/", "mod") {
		op := p.advance().text
		right, err := p.unary()
		if err != nil {
			return nil, err
		}
		left = &binaryNode{op: op, left: left, right: right}
	}
	return left, nil
}

func (p *parser) unary() (Node, error) {
	if p.isOperator("-", "+") {
		if err := p.enter(); err != nil {
			return nil, err
		}
		defer p.leave()
		op := p.advance().text
		operand, err := p.unary()
		if err != nil {
			return nil, err
		}
		if op == "+" {
			return operand, nil
		}
		return &negateNode{operand: operand}, nil
	}
	return p.power()
}

func (p *parser) power() (Node, error) {
	base, err := p.postfix()
	if err != nil {
		return nil, err
	}
	if !p.isOperator("^") {
		return base, nil
	}
	if err := p.enter(); err != nil {
		return nil, err
	}
	defer p.leave()
	p.advance()
	exponent, err := p.unary()
	if err != nil {
		return nil, err
	}
	return &binaryNode{op: "^", left: base, right: exponent}, nil
}

func (p *parser) postfix() (Node, error) {
	node, err := p.primary()
	if err != nil {
		return nil, err
	}
	for p.isOperator("!", "%") {
		if p.advance().text == "!" {
			node = &factorialNode{operand: node}
		} else {
			node = &percentNode{operand: node}
		}
	}
	return node, nil
}

var functions = map[string]bool{
	"sqrt": true, "sin": true, "cos": true, "tan": true,
	"ln": true, "log": true, "exp": true, "abs": true,
}

func (p *parser) primary() (Node, error) {
	t := p.advance()
	switch t.kind {
	case tokenNumber:
		d, err := Parse(t.text)
		switch {
		case errors.Is(err, ErrTooManyDigits):
			return nil, &SyntaxError{Position: t.pos, Message: fmt.Sprintf("number has more than %d significant digits", Precision)}
		case errors.Is(err, ErrOperandRange):
			return nil, &SyntaxError{Position: t.pos, Message: "number is out of range"}
		case err != nil:
			return nil, &SyntaxError{Position: t.pos, Message: fmt.Sprintf("invalid number %q", t.text)}
		}
		return &numberNode{value: d}, nil
	case tokenLParen:
		inner, err := p.expression()
		if err != nil {
			return nil, err
		}
		if close := p.advance(); close.kind != tokenRParen {
			return nil, &SyntaxError{Position: close.pos, Message: "missing closing parenthesis"}
		}
		return inner, nil
	case tokenIdent:
		switch {
		case t.text == "pi":
			return &numberNode{value: Pi()}, nil
		case t.text == "e":
			return &numberNode{value: E()}, nil
		case functions[t.text]:
			if open := p.advance(); open.kind != tokenLParen {
				return nil, &SyntaxError{Position: open.pos, Message: fmt.Sprintf("expected \"(\" after %s", t.text)}
			}
			arg, err := p.expression()
			if err != nil {
				return nil, err
			}
			if close := p.advance(); close.kind != tokenRParen {
				return nil, &SyntaxError{Position: close.pos, Message: "missing closing parenthesis"}
			}
			return &callNode{function: t.text, arg: arg}, nil
		default:
			return nil, &SyntaxError{Position: t.pos, Message: fmt.Sprintf("unknown name %q", t.text)}
		}
	}
	return nil, p.unexpected(t)
}

// --- Syntax tree -------------------------------------------------------------

// Node is a node of a parsed expression.
type Node interface {
	eval(unit AngleUnit) (*apd.Decimal, error)
}

type numberNode struct{ value *apd.Decimal }

type negateNode struct{ operand Node }

type factorialNode struct{ operand Node }

type percentNode struct{ operand Node }

type binaryNode struct {
	op          string
	left, right Node
}

type callNode struct {
	function string
	arg      Node
}

func (n *numberNode) eval(AngleUnit) (*apd.Decimal, error) { return n.value, nil }

func (n *negateNode) eval(unit AngleUnit) (*apd.Decimal, error) {
	v, err := n.operand.eval(unit)
	if err != nil {
		return nil, err
	}
	return Subtract(new(apd.Decimal), v)
}

func (n *factorialNode) eval(unit AngleUnit) (*apd.Decimal, error) {
	v, err := n.operand.eval(unit)
	if err != nil {
		return nil, err
	}
	return Factorial(v)
}

func (n *percentNode) eval(unit AngleUnit) (*apd.Decimal, error) {
	v, err := n.operand.eval(unit)
	if err != nil {
		return nil, err
	}
	return Percentage(v, apd.New(1, 0))
}

var binaryOps = map[string]func(a, b *apd.Decimal) (*apd.Decimal, error){
	"+": Add, "-": Subtract, "*": Multiply, "/": Divide, "^": Power, "mod": Mod,
}

func (n *binaryNode) eval(unit AngleUnit) (*apd.Decimal, error) {
	left, err := n.left.eval(unit)
	if err != nil {
		return nil, err
	}

	// "a ± b%" adds or subtracts b percent of a.
	if pct, ok := n.right.(*percentNode); ok && (n.op == "+" || n.op == "-") {
		p, err := pct.operand.eval(unit)
		if err != nil {
			return nil, err
		}
		share, err := Percentage(p, left)
		if err != nil {
			return nil, err
		}
		return binaryOps[n.op](left, share)
	}

	right, err := n.right.eval(unit)
	if err != nil {
		return nil, err
	}
	return binaryOps[n.op](left, right)
}

func (n *callNode) eval(unit AngleUnit) (*apd.Decimal, error) {
	v, err := n.arg.eval(unit)
	if err != nil {
		return nil, err
	}
	switch n.function {
	case "sqrt":
		return Sqrt(v)
	case "sin":
		return Sin(v, unit)
	case "cos":
		return Cos(v, unit)
	case "tan":
		return Tan(v, unit)
	case "ln":
		return Ln(v)
	case "log":
		return Log(v)
	case "exp":
		return Exp(v)
	default: // "abs"
		return new(apd.Decimal).Abs(v), nil
	}
}
