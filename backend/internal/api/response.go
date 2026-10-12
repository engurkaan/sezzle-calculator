package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// Machine-readable error codes returned in the "code" field of error
// responses. Clients should branch on these rather than on messages.
const (
	CodeInvalidJSON          = "INVALID_JSON"
	CodeInvalidOperand       = "INVALID_OPERAND"
	CodeMissingOperand       = "MISSING_OPERAND"
	CodeUnexpectedField      = "UNEXPECTED_FIELD"
	CodeUnsupportedMediaType = "UNSUPPORTED_MEDIA_TYPE"
	CodePayloadTooLarge      = "PAYLOAD_TOO_LARGE"
	CodeUnknownOperation     = "UNKNOWN_OPERATION"
	CodeNotFound             = "NOT_FOUND"
	CodeMethodNotAllowed     = "METHOD_NOT_ALLOWED"
	CodeDivisionByZero       = "DIVISION_BY_ZERO"
	CodeNegativeSquareRoot   = "NEGATIVE_SQUARE_ROOT"
	CodeNonRealResult        = "NON_REAL_RESULT"
	CodeResultOutOfRange     = "RESULT_OUT_OF_RANGE"
	CodeInternal             = "INTERNAL_ERROR"
)

// apiError describes a failed request and how it is rendered over HTTP.
type apiError struct {
	Status  int
	Code    string
	Message string
}

type errorBody struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// writeJSON serialises v as the response body with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// Headers are already sent, so the best we can do is record it.
		slog.Error("failed to encode response", "error", err)
	}
}

// writeError renders e using the standard error envelope:
//
//	{"error": {"code": "...", "message": "..."}}
func writeError(w http.ResponseWriter, e *apiError) {
	writeJSON(w, e.Status, errorBody{Error: errorDetail{Code: e.Code, Message: e.Message}})
}
