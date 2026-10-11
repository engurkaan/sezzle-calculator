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
)

// maxBodyBytes caps request bodies. A valid request is a few dozen bytes, so
// anything larger is rejected early instead of being read into memory.
const maxBodyBytes = 1 << 10

// operandsRequest is the wire format for every operation. Pointers let us
// tell an omitted operand apart from an explicit zero.
type operandsRequest struct {
	A *float64 `json:"a"`
	B *float64 `json:"b"`
}

// decodeOperands parses and validates the request body, returning exactly
// arity operands in order (a, then b).
func decodeOperands(w http.ResponseWriter, r *http.Request, arity int) ([]float64, *apiError) {
	if err := requireJSON(r); err != nil {
		return nil, err
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	var req operandsRequest
	if err := dec.Decode(&req); err != nil {
		return nil, decodeError(err)
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return nil, badRequest(CodeInvalidJSON, "request body must contain a single JSON object")
	}

	switch {
	case req.A == nil:
		return nil, badRequest(CodeMissingOperand, `operand "a" is required`)
	case arity == 2 && req.B == nil:
		return nil, badRequest(CodeMissingOperand, `operand "b" is required`)
	case arity == 1 && req.B != nil:
		return nil, badRequest(CodeUnexpectedField, `operand "b" is not accepted by this operation`)
	}

	if arity == 1 {
		return []float64{*req.A}, nil
	}
	return []float64{*req.A, *req.B}, nil
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
		if typeErr.Field == "" {
			return badRequest(CodeInvalidJSON, "request body must be a JSON object")
		}
		if strings.HasPrefix(typeErr.Value, "number") {
			// The value was numeric but does not fit in a float64 (e.g. 1e400).
			return badRequest(CodeInvalidOperand, fmt.Sprintf("operand %s is out of range", quote(typeErr.Field)))
		}
		return badRequest(CodeInvalidOperand, fmt.Sprintf("operand %s must be a number", quote(typeErr.Field)))
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
