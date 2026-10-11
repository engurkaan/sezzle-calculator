package api

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func discardLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

var okHandler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusTeapot)
})

func TestChainOrder(t *testing.T) {
	var order []string
	mark := func(name string) Middleware {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				order = append(order, name)
				next.ServeHTTP(w, r)
			})
		}
	}
	h := Chain(okHandler, mark("outer"), mark("inner"))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))

	if strings.Join(order, ",") != "outer,inner" {
		t.Errorf("order = %v, want [outer inner]", order)
	}
}

func TestRecover(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, nil))
	panicking := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("kaboom") })

	rec := httptest.NewRecorder()
	Recover(logger)(panicking).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/x", nil))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if got := decode[errorBody](t, rec); got.Error.Code != CodeInternal {
		t.Errorf("code = %q, want %q", got.Error.Code, CodeInternal)
	}
	if strings.Contains(rec.Body.String(), "kaboom") {
		t.Error("panic value leaked to client")
	}
	if !strings.Contains(logs.String(), "kaboom") {
		t.Error("panic value was not logged")
	}
}

func TestRecoverRepanicsOnAbortHandler(t *testing.T) {
	aborting := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic(http.ErrAbortHandler) })
	defer func() {
		if v := recover(); v != http.ErrAbortHandler {
			t.Errorf("recovered %v, want http.ErrAbortHandler", v)
		}
	}()
	Recover(discardLogger())(aborting).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
}

func TestRecoverPassesThrough(t *testing.T) {
	rec := httptest.NewRecorder()
	Recover(discardLogger())(okHandler).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusTeapot {
		t.Errorf("status = %d, want 418", rec.Code)
	}
}

func TestLogger(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, nil))

	rec := httptest.NewRecorder()
	Logger(logger)(okHandler).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/add", nil))

	line := logs.String()
	for _, want := range []string{"method=POST", "path=/api/v1/add", "status=418", "duration_ms="} {
		if !strings.Contains(line, want) {
			t.Errorf("log line %q missing %q", line, want)
		}
	}
}

func TestLoggerDefaultsToOK(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, nil))
	implicit := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("hi")) })

	Logger(logger)(implicit).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))

	if !strings.Contains(logs.String(), "status=200") {
		t.Errorf("log line %q missing status=200", logs.String())
	}
}

func TestCORS(t *testing.T) {
	const allowed = "http://localhost:5173"

	cases := []struct {
		name            string
		origins         []string
		method          string
		origin          string
		preflight       bool
		wantStatus      int
		wantAllowOrigin string
	}{
		{name: "same-origin request untouched", origins: []string{allowed}, method: http.MethodPost, wantStatus: http.StatusTeapot},
		{name: "allowed origin", origins: []string{allowed}, method: http.MethodPost, origin: allowed, wantStatus: http.StatusTeapot, wantAllowOrigin: allowed},
		{name: "disallowed origin", origins: []string{allowed}, method: http.MethodPost, origin: "http://evil.test", wantStatus: http.StatusTeapot},
		{name: "wildcard", origins: []string{"*"}, method: http.MethodPost, origin: "http://any.test", wantStatus: http.StatusTeapot, wantAllowOrigin: "http://any.test"},
		{name: "preflight allowed", origins: []string{allowed}, method: http.MethodOptions, origin: allowed, preflight: true, wantStatus: http.StatusNoContent, wantAllowOrigin: allowed},
		{name: "preflight disallowed", origins: []string{allowed}, method: http.MethodOptions, origin: "http://evil.test", preflight: true, wantStatus: http.StatusTeapot},
		{name: "plain OPTIONS is not a preflight", origins: []string{allowed}, method: http.MethodOptions, origin: allowed, wantStatus: http.StatusTeapot, wantAllowOrigin: allowed},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, "/api/v1/add", nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			if tc.preflight {
				req.Header.Set("Access-Control-Request-Method", http.MethodPost)
			}
			rec := httptest.NewRecorder()
			CORS(tc.origins)(okHandler).ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Errorf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
			if got := rec.Header().Get("Access-Control-Allow-Origin"); got != tc.wantAllowOrigin {
				t.Errorf("Allow-Origin = %q, want %q", got, tc.wantAllowOrigin)
			}
			if tc.origin != "" && rec.Header().Get("Vary") != "Origin" {
				t.Errorf("Vary = %q, want Origin", rec.Header().Get("Vary"))
			}
			if tc.preflight && tc.wantStatus == http.StatusNoContent {
				if got := rec.Header().Get("Access-Control-Allow-Headers"); got != "Content-Type" {
					t.Errorf("Allow-Headers = %q, want Content-Type", got)
				}
				if got := rec.Header().Get("Access-Control-Allow-Methods"); !strings.Contains(got, "POST") {
					t.Errorf("Allow-Methods = %q, want it to include POST", got)
				}
			}
		})
	}
}
