package api

import (
	"errors"
	"net/http"

	"github.com/engurkaan/sezzle-calculator/backend/internal/calculator"
)

// Numbers are strings because most JSON clients, browsers included, would parse them into
// binary floats and lose precision.
type CalculationResponse struct {
	Operation string   `json:"operation"`
	Operands  []string `json:"operands"`
	Result    string   `json:"result"`
}

type EvaluationResponse struct {
	Expression string `json:"expression"`
	Result     string `json:"result"`
}

type OperationInfo struct {
	Name     string `json:"name"`
	Operands int    `json:"operands"`
}

func NewHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealth)
	mux.HandleFunc("GET /api/v1/operations", handleListOperations)
	mux.HandleFunc("POST /api/v1/evaluate", handleEvaluate)
	mux.HandleFunc("POST /api/v1/{operation}", handleCalculate)
	// Catch-all routes so that 404 and 405 responses also use the JSON error envelope.
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

	operands, opts, apiErr := decodeOperands(w, r, name, arity)
	if apiErr != nil {
		writeError(w, apiErr)
		return
	}

	result, err := calculator.Calculate(name, opts, operands...)
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

func handleEvaluate(w http.ResponseWriter, r *http.Request) {
	var req evaluateRequest
	if apiErr := decodeBody(w, r, &req); apiErr != nil {
		writeError(w, apiErr)
		return
	}
	if req.Expression == nil {
		writeError(w, badRequest(CodeMissingOperand, `field "expression" is required`))
		return
	}
	unit, apiErr := decodeAngleUnit(req.AngleUnit)
	if apiErr != nil {
		writeError(w, apiErr)
		return
	}

	result, err := calculator.Evaluate(*req.Expression, calculator.Options{AngleUnit: unit})
	if err != nil {
		var syntaxErr *calculator.SyntaxError
		if errors.As(err, &syntaxErr) {
			writeError(w, &apiError{
				Status:   http.StatusBadRequest,
				Code:     CodeInvalidExpression,
				Message:  syntaxErr.Error(),
				Position: syntaxErr.Position,
			})
			return
		}
		writeError(w, domainError(err))
		return
	}

	writeJSON(w, http.StatusOK, EvaluationResponse{
		Expression: *req.Expression,
		Result:     calculator.Format(result),
	})
}

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
	case errors.Is(err, calculator.ErrLogDomain),
		errors.Is(err, calculator.ErrFactorialDomain),
		errors.Is(err, calculator.ErrTangentUndefined),
		errors.Is(err, calculator.ErrArgumentTooLarge):
		e.Code = CodeDomainError
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
