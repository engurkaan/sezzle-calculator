package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/cockroachdb/apd/v3"
	"github.com/engurkaan/sezzle-calculator/backend/internal/calculator"
)

// maxBodyBytes caps request bodies. The largest valid request is an
// expression of calculator.MaxExpressionLength characters, so anything larger
// is rejected early instead of being read into memory.
const maxBodyBytes = 4 << 10

// operandsRequest is the wire format for every operation. Operands are kept
// as raw JSON so that both numbers (5.25) and strings ("5.25") can be parsed
// from their exact text, without a lossy detour through float64.
type operandsRequest struct {
	A         json.RawMessage `json:"a"`
	B         json.RawMessage `json:"b"`
	AngleUnit *string         `json:"angleUnit"`
}

// evaluateRequest is the wire format for POST /api/v1/evaluate.
type evaluateRequest struct {
	Expression *string `json:"expression"`
	AngleUnit  *string `json:"angleUnit"`
}

// decodeBody reads a single JSON object into v, enforcing the content type,
// the size limit and the absence of unknown fields or trailing data.
func decodeBody(w http.ResponseWriter, r *http.Request, v any) *apiError {
	if err := requireJSON(r); err != nil {
		return err
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	if err := dec.Decode(v); err != nil {
		return decodeError(err)
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return badRequest(CodeInvalidJSON, "request body must contain a single JSON object")
	}
	return nil
}

// decodeAngleUnit validates the optional angleUnit field.
func decodeAngleUnit(raw *string) (calculator.AngleUnit, *apiError) {
	if raw == nil {
		return calculator.Radians, nil
	}
	unit, err := calculator.ParseAngleUnit(*raw)
	if err != nil {
		return "", badRequest(CodeInvalidAngleUnit, err.Error())
	}
	return unit, nil
}

// decodeOperands parses and validates the request body for the named
// operation, returning exactly arity operands in order (a, then b).
func decodeOperands(w http.ResponseWriter, r *http.Request, name string, arity int) ([]*apd.Decimal, calculator.Options, *apiError) {
	var req operandsRequest
	if err := decodeBody(w, r, &req); err != nil {
		return nil, calculator.Options{}, err
	}

	var opts calculator.Options
	if req.AngleUnit != nil {
		if !calculator.UsesAngleUnit(name) {
			return nil, opts, badRequest(CodeUnexpectedField, fmt.Sprintf("operation %s does not accept angleUnit", quote(name)))
		}
		unit, err := decodeAngleUnit(req.AngleUnit)
		if err != nil {
			return nil, opts, err
		}
		opts.AngleUnit = unit
	}

	fields := []struct {
		name string
		raw  json.RawMessage
	}{{"a", req.A}, {"b", req.B}}

	operands := make([]*apd.Decimal, 0, arity)
	for i, f := range fields {
		present := len(f.raw) > 0 && string(f.raw) != "null"
		switch {
		case i < arity && !present:
			return nil, opts, badRequest(CodeMissingOperand, fmt.Sprintf("operand %s is required", quote(f.name)))
		case i >= arity && present:
			return nil, opts, badRequest(CodeUnexpectedField, fmt.Sprintf("operand %s is not accepted by this operation", quote(f.name)))
		case i >= arity:
			continue
		}
		d, err := parseOperand(f.name, f.raw)
		if err != nil {
			return nil, opts, err
		}
		operands = append(operands, d)
	}
	return operands, opts, nil
}

// parseOperand accepts a JSON number or a JSON string containing a decimal
// number, and parses it exactly.
func parseOperand(name string, raw json.RawMessage) (*apd.Decimal, *apiError) {
	var text string
	switch raw[0] {
	case '"':
		if err := json.Unmarshal(raw, &text); err != nil {
			return nil, badRequest(CodeInvalidJSON, "request body is not valid JSON")
		}
	case '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9':
		text = string(raw)
	default:
		return nil, badRequest(CodeInvalidOperand, fmt.Sprintf("operand %s must be a number", quote(name)))
	}

	d, err := calculator.Parse(text)
	switch {
	case errors.Is(err, calculator.ErrTooManyDigits):
		return nil, badRequest(CodeInvalidOperand, fmt.Sprintf("operand %s has more than %d significant digits", quote(name), calculator.Precision))
	case errors.Is(err, calculator.ErrOperandRange):
		return nil, badRequest(CodeInvalidOperand, fmt.Sprintf("operand %s is out of range", quote(name)))
	case err != nil:
		return nil, badRequest(CodeInvalidOperand, fmt.Sprintf("operand %s must be a number", quote(name)))
	}
	return d, nil
}

func requireJSON(r *http.Request) *apiError {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return &apiError{
			Status:  http.StatusUnsupportedMediaType,
			Code:    CodeUnsupportedMediaType,
			Message: "Content-Type must be application/json",
		}
	}
	return nil
}

// decodeError translates encoding/json failures into client-friendly errors.
func decodeError(err error) *apiError {
	var (
		syntaxErr  *json.SyntaxError
		typeErr    *json.UnmarshalTypeError
		maxSizeErr *http.MaxBytesError
	)
	switch {
	case errors.As(err, &maxSizeErr):
		return &apiError{
			Status:  http.StatusRequestEntityTooLarge,
			Code:    CodePayloadTooLarge,
			Message: fmt.Sprintf("request body must not exceed %d bytes", maxSizeErr.Limit),
		}
	case errors.Is(err, io.EOF):
		return badRequest(CodeInvalidJSON, "request body must not be empty")
	case errors.As(err, &syntaxErr), errors.Is(err, io.ErrUnexpectedEOF):
		return badRequest(CodeInvalidJSON, "request body is not valid JSON")
	case errors.As(err, &typeErr):
		// Operands are raw JSON, so the only possible mismatch is the body itself.
		return badRequest(CodeInvalidJSON, "request body must be a JSON object")
	case strings.HasPrefix(err.Error(), "json: unknown field "):
		// encoding/json does not export a type for this error.
		field := strings.TrimPrefix(err.Error(), "json: unknown field ")
		return badRequest(CodeUnexpectedField, "unknown field "+field)
	default:
		return badRequest(CodeInvalidJSON, "request body is not valid JSON")
	}
}

func badRequest(code, message string) *apiError {
	return &apiError{Status: http.StatusBadRequest, Code: code, Message: message}
}

func quote(s string) string { return strconv.Quote(s) }
