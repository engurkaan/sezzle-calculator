package api

import (
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"time"
)

// Middleware wraps an http.Handler with additional behaviour.
type Middleware func(http.Handler) http.Handler

// Chain applies middlewares so that the first one listed is the outermost.
func Chain(h http.Handler, middlewares ...Middleware) http.Handler {
	for _, m := range slices.Backward(middlewares) {
		h = m(h)
	}
	return h
}

// Recover converts panics into a 500 JSON response instead of dropping the
// connection, and logs the panic value.
func Recover(logger *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if v := recover(); v != nil {
					if v == http.ErrAbortHandler {
						panic(v)
					}
					logger.Error("panic while serving request",
						"panic", v, "method", r.Method, "path", r.URL.Path)
					writeError(w, &apiError{
						Status:  http.StatusInternalServerError,
						Code:    CodeInternal,
						Message: "internal server error",
					})
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// statusRecorder captures the status code written by downstream handlers.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

// Logger emits one structured log line per request.
func Logger(logger *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)
			logger.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", rec.status,
				"duration_ms", float64(time.Since(start).Microseconds())/1000,
			)
		})
	}
}

// CORS allows browsers on the given origins to call the API. A single "*"
// entry allows any origin. Preflight requests are answered directly.
func CORS(allowedOrigins []string) Middleware {
	allowAny := slices.Contains(allowedOrigins, "*")
	const maxAge = 10 * time.Minute

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin == "" {
				next.ServeHTTP(w, r)
				return
			}

			w.Header().Add("Vary", "Origin")
			if !allowAny && !slices.Contains(allowedOrigins, origin) {
				next.ServeHTTP(w, r)
				return
			}

			w.Header().Set("Access-Control-Allow-Origin", origin)
			if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
				w.Header().Set("Access-Control-Max-Age", strconv.Itoa(int(maxAge.Seconds())))
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
