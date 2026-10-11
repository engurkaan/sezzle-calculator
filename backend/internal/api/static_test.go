package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func staticFixture(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	write := func(name, content string) {
		p := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("index.html", "<!doctype html><title>app</title>")
	write("favicon.svg", "<svg/>")
	write("assets/index-abc123.js", "console.log(1)")
	return dir
}

func TestWithStaticRequiresIndex(t *testing.T) {
	if _, err := WithStatic(NewHandler(), t.TempDir()); err == nil {
		t.Fatal("expected error for a directory without index.html")
	}
}

func TestWithStatic(t *testing.T) {
	h, err := WithStatic(NewHandler(), staticFixture(t))
	if err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name         string
		method       string
		path         string
		wantStatus   int
		wantBody     string
		wantCache    string
		wantJSONBody bool
	}{
		{name: "root serves index", path: "/", wantStatus: 200, wantBody: "<title>app</title>", wantCache: "no-cache"},
		{name: "index.html redirects to root", path: "/index.html", wantStatus: 301},
		{name: "static file", path: "/favicon.svg", wantStatus: 200, wantBody: "<svg/>"},
		{name: "hashed asset is immutable", path: "/assets/index-abc123.js", wantStatus: 200, wantBody: "console.log(1)", wantCache: "public, max-age=31536000, immutable"},
		{name: "client route falls back to index", path: "/history/42", wantStatus: 200, wantBody: "<title>app</title>", wantCache: "no-cache"},
		{name: "directory falls back to index", path: "/assets/", wantStatus: 200, wantBody: "<title>app</title>"},
		{name: "dot segments are redirected to the clean path", path: "/assets/../../etc/passwd", wantStatus: 307},
		{name: "missing file never escapes dir", path: "/etc/passwd", wantStatus: 200, wantBody: "<title>app</title>"},
		{name: "HEAD allowed", method: http.MethodHead, path: "/", wantStatus: 200},
		{name: "POST to static rejected", method: http.MethodPost, path: "/", wantStatus: 405},
		{name: "health still served", path: "/healthz", wantStatus: 200, wantJSONBody: true},
		{name: "API still served as JSON", path: "/api/v1/operations", wantStatus: 200, wantJSONBody: true},
		{name: "unknown API route stays JSON 404", path: "/api/nope", wantStatus: 404, wantJSONBody: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			method := tc.method
			if method == "" {
				method = http.MethodGet
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(method, tc.path, nil))

			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
			body, _ := io.ReadAll(rec.Body)
			if tc.wantBody != "" && !strings.Contains(string(body), tc.wantBody) {
				t.Errorf("body = %q, want it to contain %q", body, tc.wantBody)
			}
			if tc.wantCache != "" && rec.Header().Get("Cache-Control") != tc.wantCache {
				t.Errorf("Cache-Control = %q, want %q", rec.Header().Get("Cache-Control"), tc.wantCache)
			}
			if tc.wantJSONBody && !strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json") {
				t.Errorf("Content-Type = %q, want JSON", rec.Header().Get("Content-Type"))
			}
		})
	}
}
