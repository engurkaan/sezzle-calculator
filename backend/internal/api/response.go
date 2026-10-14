package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

const (
	CodeInvalidJSON          = "INVALID_JSON"
	CodeInvalidOperand       = "INVALID_OPERAND"
	CodeMissingOperand       = "MISSING_OPERAND"
	CodeUnexpectedField      = "UNEXPECTED_FIELD"
	CodeInvalidAngleUnit     = "INVALID_ANGLE_UNIT"
	CodeInvalidExpression    = "INVALID_EXPRESSION"
	CodeUnsupportedMediaType = "UNSUPPORTED_MEDIA_TYPE"
	CodePayloadTooLarge      = "PAYLOAD_TOO_LARGE"
	CodeUnknownOperation     = "UNKNOWN_OPERATION"
	CodeNotFound             = "NOT_FOUND"
	CodeMethodNotAllowed     = "METHOD_NOT_ALLOWED"
	CodeDivisionByZero       = "DIVISION_BY_ZERO"
	CodeNegativeSquareRoot   = "NEGATIVE_SQUARE_ROOT"
	CodeNonRealResult        = "NON_REAL_RESULT"
	CodeDomainError          = "DOMAIN_ERROR"
	CodeResultOutOfRange     = "RESULT_OUT_OF_RANGE"
	CodeInternal             = "INTERNAL_ERROR"
)

type apiError struct {
	Status   int
	Code     string
	Message  string
	Position int
}

type errorBody struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code     string `json:"code"`
	Message  string `json:"message"`
	Position int    `json:"position,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// The status line is already sent, so the failure can only be logged.
		slog.Error("failed to encode response", "error", err)
	}
}

func writeError(w http.ResponseWriter, e *apiError) {
	writeJSON(w, e.Status, errorBody{Error: errorDetail{Code: e.Code, Message: e.Message, Position: e.Position}})
}
