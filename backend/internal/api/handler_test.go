package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
)

// do sends a request through the API handler and returns the recorder.
func do(t *testing.T, method, path, contentType, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	rec := httptest.NewRecorder()
	NewHandler().ServeHTTP(rec, req)
	return rec
}

func postJSON(t *testing.T, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	return do(t, http.MethodPost, path, "application/json", body)
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}
	var v T
	if err := json.NewDecoder(rec.Body).Decode(&v); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return v
}

func TestCalculateSuccess(t *testing.T) {
	cases := []struct {
		name         string
		path         string
		body         string
		wantOperands []string
		wantResult   string
	}{
		{name: "add", path: "/api/v1/add", body: `{"a":5,"b":3}`, wantOperands: []string{"5", "3"}, wantResult: "8"},
		{name: "subtract", path: "/api/v1/subtract", body: `{"a":5,"b":8}`, wantOperands: []string{"5", "8"}, wantResult: "-3"},
		{name: "multiply", path: "/api/v1/multiply", body: `{"a":-4,"b":2.5}`, wantOperands: []string{"-4", "2.5"}, wantResult: "-10"},
		{name: "divide", path: "/api/v1/divide", body: `{"a":1,"b":4}`, wantOperands: []string{"1", "4"}, wantResult: "0.25"},
		{name: "power", path: "/api/v1/power", body: `{"a":2,"b":8}`, wantOperands: []string{"2", "8"}, wantResult: "256"},
		{name: "percentage", path: "/api/v1/percentage", body: `{"a":15,"b":80}`, wantOperands: []string{"15", "80"}, wantResult: "12"},
		{name: "sqrt", path: "/api/v1/sqrt", body: `{"a":49}`, wantOperands: []string{"49"}, wantResult: "7"},
		{name: "explicit zero operands", path: "/api/v1/add", body: `{"a":0,"b":0}`, wantOperands: []string{"0", "0"}, wantResult: "0"},
		{name: "scientific notation", path: "/api/v1/multiply", body: `{"a":1e3,"b":2E-1}`, wantOperands: []string{"1000", "0.2"}, wantResult: "200"},
		{name: "fields in any order", path: "/api/v1/subtract", body: `{"b":1,"a":3}`, wantOperands: []string{"3", "1"}, wantResult: "2"},
		{name: "string operands", path: "/api/v1/add", body: `{"a":"0.1","b":"0.2"}`, wantOperands: []string{"0.1", "0.2"}, wantResult: "0.3"},
		{name: "decimal numbers are exact", path: "/api/v1/add", body: `{"a":0.1,"b":0.2}`, wantOperands: []string{"0.1", "0.2"}, wantResult: "0.3"},
		{name: "beyond float64 precision", path: "/api/v1/add", body: `{"a":"9007199254740993","b":"1"}`, wantOperands: []string{"9007199254740993", "1"}, wantResult: "9007199254740994"},
		{name: "number beyond float64 range", path: "/api/v1/multiply", body: `{"a":1e400,"b":2}`, wantOperands: []string{"1e+400", "2"}, wantResult: "2e+400"},
		{name: "rounded to 34 digits", path: "/api/v1/divide", body: `{"a":"1","b":"3"}`, wantOperands: []string{"1", "3"}, wantResult: "0.3333333333333333333333333333333333"},
		{name: "operands are normalised", path: "/api/v1/add", body: `{"a":"12.50","b":"-0"}`, wantOperands: []string{"12.5", "0"}, wantResult: "12.5"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := postJSON(t, tc.path, tc.body)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body)
			}
			got := decode[CalculationResponse](t, rec)
			if want := strings.TrimPrefix(tc.path, "/api/v1/"); got.Operation != want {
				t.Errorf("operation = %q, want %q", got.Operation, want)
			}
			if got.Result != tc.wantResult {
				t.Errorf("result = %q, want %q", got.Result, tc.wantResult)
			}
			if !slices.Equal(got.Operands, tc.wantOperands) {
				t.Errorf("operands = %q, want %q", got.Operands, tc.wantOperands)
			}
		})
	}
}

func TestCalculateResponseShape(t *testing.T) {
	rec := postJSON(t, "/api/v1/add", `{"a":5,"b":3}`)
	want := `{"operation":"add","operands":["5","3"],"result":"8"}` + "\n"
	if rec.Body.String() != want {
		t.Errorf("body = %q, want %q", rec.Body.String(), want)
	}
}

func TestCalculateErrors(t *testing.T) {
	cases := []struct {
		name        string
		method      string
		path        string
		contentType string
		body        string
		wantStatus  int
		wantCode    string
	}{
		// Domain errors: well-formed but not computable.
		{name: "division by zero", path: "/api/v1/divide", body: `{"a":1,"b":0}`, wantStatus: 422, wantCode: CodeDivisionByZero},
		{name: "negative sqrt", path: "/api/v1/sqrt", body: `{"a":-9}`, wantStatus: 422, wantCode: CodeNegativeSquareRoot},
		{name: "overflowing result", path: "/api/v1/multiply", body: `{"a":1e6000,"b":1e6000}`, wantStatus: 422, wantCode: CodeResultOutOfRange},
		{name: "non-real result", path: "/api/v1/power", body: `{"a":-8,"b":0.5}`, wantStatus: 422, wantCode: CodeNonRealResult},
		{name: "zero to a negative power", path: "/api/v1/power", body: `{"a":0,"b":-1}`, wantStatus: 422, wantCode: CodeDivisionByZero},

		// Routing.
		{name: "unknown operation", path: "/api/v1/modulo", body: `{"a":1,"b":2}`, wantStatus: 404, wantCode: CodeUnknownOperation},
		{name: "unknown api route", path: "/api/v2/add", body: `{"a":1,"b":2}`, wantStatus: 404, wantCode: CodeNotFound},
		{name: "nested api route", path: "/api/v1/add/extra", body: `{"a":1,"b":2}`, wantStatus: 404, wantCode: CodeNotFound},
		{name: "GET on operation", method: http.MethodGet, path: "/api/v1/add", wantStatus: 405, wantCode: CodeMethodNotAllowed},
		{name: "DELETE on operations list", method: http.MethodDelete, path: "/api/v1/operations", wantStatus: 405, wantCode: CodeMethodNotAllowed},

		// Content negotiation and size.
		{name: "missing content type", path: "/api/v1/add", contentType: "-", body: `{"a":1,"b":2}`, wantStatus: 415, wantCode: CodeUnsupportedMediaType},
		{name: "form content type", path: "/api/v1/add", contentType: "application/x-www-form-urlencoded", body: `a=1&b=2`, wantStatus: 415, wantCode: CodeUnsupportedMediaType},
		{name: "oversized body", path: "/api/v1/add", body: `{"a":1,"b":2` + strings.Repeat(" ", maxBodyBytes) + `}`, wantStatus: 413, wantCode: CodePayloadTooLarge},

		// Malformed payloads.
		{name: "empty body", path: "/api/v1/add", body: ``, wantStatus: 400, wantCode: CodeInvalidJSON},
		{name: "syntax error", path: "/api/v1/add", body: `{"a":1,`, wantStatus: 400, wantCode: CodeInvalidJSON},
		{name: "invalid token", path: "/api/v1/add", body: `{"a":1,"b":two}`, wantStatus: 400, wantCode: CodeInvalidJSON},
		{name: "array body", path: "/api/v1/add", body: `[1,2]`, wantStatus: 400, wantCode: CodeInvalidJSON},
		{name: "trailing data", path: "/api/v1/add", body: `{"a":1,"b":2}{"a":3}`, wantStatus: 400, wantCode: CodeInvalidJSON},
		{name: "trailing garbage", path: "/api/v1/add", body: `{"a":1,"b":2} x`, wantStatus: 400, wantCode: CodeInvalidJSON},
		{name: "NaN literal", path: "/api/v1/add", body: `{"a":NaN,"b":2}`, wantStatus: 400, wantCode: CodeInvalidJSON},

		// Operand validation.
		{name: "missing a", path: "/api/v1/add", body: `{"b":2}`, wantStatus: 400, wantCode: CodeMissingOperand},
		{name: "missing b", path: "/api/v1/add", body: `{"a":2}`, wantStatus: 400, wantCode: CodeMissingOperand},
		{name: "null operand", path: "/api/v1/add", body: `{"a":null,"b":2}`, wantStatus: 400, wantCode: CodeMissingOperand},
		{name: "empty object", path: "/api/v1/sqrt", body: `{}`, wantStatus: 400, wantCode: CodeMissingOperand},
		{name: "non-numeric string", path: "/api/v1/add", body: `{"a":"one","b":2}`, wantStatus: 400, wantCode: CodeInvalidOperand},
		{name: "NaN string", path: "/api/v1/add", body: `{"a":"NaN","b":2}`, wantStatus: 400, wantCode: CodeInvalidOperand},
		{name: "Infinity string", path: "/api/v1/add", body: `{"a":"Infinity","b":2}`, wantStatus: 400, wantCode: CodeInvalidOperand},
		{name: "formatted string", path: "/api/v1/add", body: `{"a":"1,000","b":2}`, wantStatus: 400, wantCode: CodeInvalidOperand},
		{name: "boolean operand", path: "/api/v1/add", body: `{"a":1,"b":true}`, wantStatus: 400, wantCode: CodeInvalidOperand},
		{name: "object operand", path: "/api/v1/add", body: `{"a":{"v":1},"b":2}`, wantStatus: 400, wantCode: CodeInvalidOperand},
		{name: "array operand", path: "/api/v1/add", body: `{"a":[1],"b":2}`, wantStatus: 400, wantCode: CodeInvalidOperand},
		{name: "too many digits", path: "/api/v1/add", body: `{"a":"12345678901234567890123456789012345","b":1}`, wantStatus: 400, wantCode: CodeInvalidOperand},
		{name: "operand out of range", path: "/api/v1/add", body: `{"a":1e7000,"b":1}`, wantStatus: 400, wantCode: CodeInvalidOperand},
		{name: "invalid escape in string", path: "/api/v1/add", body: `{"a":"\x","b":1}`, wantStatus: 400, wantCode: CodeInvalidJSON},
		{name: "unknown field", path: "/api/v1/add", body: `{"a":1,"b":2,"c":3}`, wantStatus: 400, wantCode: CodeUnexpectedField},
		{name: "b on unary operation", path: "/api/v1/sqrt", body: `{"a":4,"b":2}`, wantStatus: 400, wantCode: CodeUnexpectedField},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			method := tc.method
			if method == "" {
				method = http.MethodPost
			}
			contentType := tc.contentType
			switch contentType {
			case "":
				contentType = "application/json"
			case "-":
				contentType = ""
			}

			rec := do(t, method, tc.path, contentType, tc.body)
			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d; body: %s", rec.Code, tc.wantStatus, rec.Body)
			}
			got := decode[errorBody](t, rec)
			if got.Error.Code != tc.wantCode {
				t.Errorf("code = %q, want %q", got.Error.Code, tc.wantCode)
			}
			if got.Error.Message == "" {
				t.Error("message is empty")
			}
		})
	}
}

func TestContentTypeWithParameters(t *testing.T) {
	rec := do(t, http.MethodPost, "/api/v1/add", "application/json; charset=utf-8", `{"a":1,"b":2}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body)
	}
}

func TestMethodNotAllowedSetsAllowHeader(t *testing.T) {
	cases := map[string]string{
		"/api/v1/add":        "POST",
		"/api/v1/operations": "GET, HEAD",
	}
	for path, want := range cases {
		rec := do(t, http.MethodPut, path, "", "")
		if got := rec.Header().Get("Allow"); got != want {
			t.Errorf("%s: Allow = %q, want %q", path, got, want)
		}
	}
}

func TestErrorMessages(t *testing.T) {
	cases := []struct {
		name, path, body, want string
	}{
		{name: "missing operand names the field", path: "/api/v1/divide", body: `{"a":1}`, want: `operand "b" is required`},
		{name: "type error names the field", path: "/api/v1/add", body: `{"a":"x","b":1}`, want: `operand "a" must be a number`},
		{name: "precision limit is explained", path: "/api/v1/add", body: `{"a":1,"b":"12345678901234567890123456789012345"}`, want: `operand "b" has more than 34 significant digits`},
		{name: "range limit is explained", path: "/api/v1/add", body: `{"a":"1e9999","b":1}`, want: `operand "a" is out of range`},
		{name: "unknown field is named", path: "/api/v1/add", body: `{"a":1,"b":1,"op":"x"}`, want: `unknown field "op"`},
		{name: "division by zero", path: "/api/v1/divide", body: `{"a":1,"b":0}`, want: "division by zero is undefined"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := decode[errorBody](t, postJSON(t, tc.path, tc.body))
			if got.Error.Message != tc.want {
				t.Errorf("message = %q, want %q", got.Error.Message, tc.want)
			}
		})
	}
}

func TestHealth(t *testing.T) {
	rec := do(t, http.MethodGet, "/healthz", "", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := decode[map[string]string](t, rec); got["status"] != "ok" {
		t.Errorf("status = %q, want ok", got["status"])
	}
}

func TestListOperations(t *testing.T) {
	rec := do(t, http.MethodGet, "/api/v1/operations", "", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	got := decode[map[string][]OperationInfo](t, rec)["operations"]
	want := map[string]int{
		"add": 2, "subtract": 2, "multiply": 2, "divide": 2,
		"power": 2, "percentage": 2, "sqrt": 1,
	}
	if len(got) != len(want) {
		t.Fatalf("got %d operations, want %d: %v", len(got), len(want), got)
	}
	for _, op := range got {
		if want[op.Name] != op.Operands {
			t.Errorf("%s: operands = %d, want %d", op.Name, op.Operands, want[op.Name])
		}
	}
}

func TestDomainErrorFallsBackToInternal(t *testing.T) {
	e := domainError(errors.New("boom"))
	if e.Status != http.StatusInternalServerError || e.Code != CodeInternal {
		t.Errorf("got %d %s, want 500 %s", e.Status, e.Code, CodeInternal)
	}
	if e.Message == "boom" {
		t.Error("internal error details must not leak to clients")
	}
}
