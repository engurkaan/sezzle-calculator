// Package api exposes the calculator over a JSON REST interface.
package api

import (
	"errors"
	"net/http"

	"github.com/engurkaan/sezzle-calculator/backend/internal/calculator"
)

// CalculationResponse is the success payload for every operation. Numbers are
// encoded as decimal strings: JSON numbers would be parsed into binary floats
// by most clients (including every browser), silently losing precision.
type CalculationResponse struct {
	Operation string   `json:"operation"`
	Operands  []string `json:"operands"`
	Result    string   `json:"result"`
}

// OperationInfo describes one supported operation for discovery clients.
type OperationInfo struct {
	Name     string `json:"name"`
	Operands int    `json:"operands"`
}

// NewHandler returns an http.Handler serving the calculator API:
//
//	GET  /healthz
//	GET  /api/v1/operations
//	POST /api/v1/{operation}
//
// Every response under /api, including 404 and 405, uses a JSON body.
func NewHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealth)
	mux.HandleFunc("GET /api/v1/operations", handleListOperations)
	mux.HandleFunc("POST /api/v1/{operation}", handleCalculate)
	// Less specific patterns catch everything the routes above do not, so
	// that clients always receive the JSON error envelope.
	mux.HandleFunc("/api/v1/{operation}", methodNotAllowed)
	mux.HandleFunc("/api/", notFound)
	return mux
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func handleListOperations(w http.ResponseWriter, _ *http.Request) {
	names := calculator.Operations()
	ops := make([]OperationInfo, 0, len(names))
	for _, name := range names {
		arity, _ := calculator.Arity(name)
		ops = append(ops, OperationInfo{Name: name, Operands: arity})
	}
	writeJSON(w, http.StatusOK, map[string][]OperationInfo{"operations": ops})
}

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("operation")
	arity, ok := calculator.Arity(name)
	if !ok {
		writeError(w, &apiError{
			Status:  http.StatusNotFound,
			Code:    CodeUnknownOperation,
			Message: "unknown operation " + quote(name),
		})
		return
	}

	operands, apiErr := decodeOperands(w, r, arity)
	if apiErr != nil {
		writeError(w, apiErr)
		return
	}

	result, err := calculator.Calculate(name, operands...)
	if err != nil {
		writeError(w, domainError(err))
		return
	}

	formatted := make([]string, len(operands))
	for i, o := range operands {
		formatted[i] = calculator.Format(o)
	}
	writeJSON(w, http.StatusOK, CalculationResponse{
		Operation: name,
		Operands:  formatted,
		Result:    calculator.Format(result),
	})
}

// domainError maps calculator errors onto HTTP errors. Domain failures are
// reported as 422: the request was well formed but cannot be computed.
func domainError(err error) *apiError {
	e := &apiError{Status: http.StatusUnprocessableEntity, Message: err.Error()}
	switch {
	case errors.Is(err, calculator.ErrDivisionByZero):
		e.Code = CodeDivisionByZero
	case errors.Is(err, calculator.ErrNegativeSqrt):
		e.Code = CodeNegativeSquareRoot
	case errors.Is(err, calculator.ErrNonReal):
		e.Code = CodeNonRealResult
	case errors.Is(err, calculator.ErrOutOfRange):
		e.Code = CodeResultOutOfRange
	default:
		e.Status, e.Code, e.Message = http.StatusInternalServerError, CodeInternal, "internal server error"
	}
	return e
}

func methodNotAllowed(w http.ResponseWriter, r *http.Request) {
	allowed := http.MethodPost
	if r.PathValue("operation") == "operations" {
		allowed = http.MethodGet + ", " + http.MethodHead
	}
	w.Header().Set("Allow", allowed)
	writeError(w, &apiError{
		Status:  http.StatusMethodNotAllowed,
		Code:    CodeMethodNotAllowed,
		Message: "method " + r.Method + " is not allowed; use " + allowed,
	})
}

func notFound(w http.ResponseWriter, r *http.Request) {
	writeError(w, &apiError{
		Status:  http.StatusNotFound,
		Code:    CodeNotFound,
		Message: "no route for " + r.URL.Path,
	})
}
