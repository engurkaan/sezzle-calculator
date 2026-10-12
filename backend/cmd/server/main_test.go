package main

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"
)

// freePort asks the kernel for an unused port.
func freePort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	return ln.Addr().(*net.TCPAddr).Port
}

func TestRunServesAndShutsDown(t *testing.T) {
	port := freePort(t)
	getenv := func(key string) string {
		if key == "PORT" {
			return strconv.Itoa(port)
		}
		return ""
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	ctx, cancel := context.WithCancel(context.Background())
	ready := make(chan string, 1)
	done := make(chan error, 1)
	go func() { done <- run(ctx, getenv, logger, ready) }()

	select {
	case <-ready:
	case err := <-done:
		t.Fatalf("run exited early: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("server did not become ready")
	}

	url := "http://127.0.0.1:" + strconv.Itoa(port) + "/api/v1/add"
	resp, err := http.Post(url, "application/json", strings.NewReader(`{"a":2,"b":3}`))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body struct{ Result string }
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK || body.Result != "5" {
		t.Fatalf("got %d result=%v, want 200 result=\"5\"", resp.StatusCode, body.Result)
	}

	if err := probe(getenv); err != nil {
		t.Errorf("probe() = %v, want nil while the server is up", err)
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("run returned %v, want nil after graceful shutdown", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("server did not shut down")
	}
}

func TestRunRejectsInvalidConfig(t *testing.T) {
	getenv := func(key string) string {
		if key == "PORT" {
			return "not-a-port"
		}
		return ""
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	if err := run(context.Background(), getenv, logger, nil); err == nil {
		t.Fatal("expected configuration error")
	}
}

func TestRunRejectsMissingStaticDir(t *testing.T) {
	getenv := func(key string) string {
		if key == "STATIC_DIR" {
			return t.TempDir() // exists but has no index.html
		}
		return ""
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	if err := run(context.Background(), getenv, logger, nil); err == nil {
		t.Fatal("expected static dir error")
	}
}

func TestProbeFailsWhenServerIsDown(t *testing.T) {
	port := strconv.Itoa(freePort(t))
	if err := probe(func(string) string { return port }); err == nil {
		t.Fatal("expected probe to fail with nothing listening")
	}
	if err := probe(func(string) string { return "bad" }); err == nil {
		t.Fatal("expected probe to fail on invalid config")
	}
}
