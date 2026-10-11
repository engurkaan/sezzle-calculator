// Command server runs the calculator REST API.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/engurkaan/sezzle-calculator/backend/internal/api"
	"github.com/engurkaan/sezzle-calculator/backend/internal/config"
)

const shutdownTimeout = 10 * time.Second

func main() {
	healthcheck := flag.Bool("healthcheck", false, "probe the local server's /healthz and exit 0 if healthy")
	flag.Parse()
	if *healthcheck {
		// Lets container runtimes check health without a shell or curl in
		// the (distroless) image.
		if err := probe(os.Getenv); err != nil {
			fmt.Fprintln(os.Stderr, "unhealthy:", err)
			os.Exit(1)
		}
		return
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := run(ctx, os.Getenv, logger, nil); err != nil {
		logger.Error("server exited with error", "error", err)
		os.Exit(1)
	}
}

// run starts the server and blocks until ctx is cancelled, then shuts down
// gracefully. If ready is non-nil it receives the bound address once the
// server is accepting connections.
func run(ctx context.Context, getenv func(string) string, logger *slog.Logger, ready chan<- string) error {
	cfg, err := config.Load(getenv)
	if err != nil {
		return err
	}

	handler := api.NewHandler()
	if cfg.StaticDir != "" {
		if handler, err = api.WithStatic(handler, cfg.StaticDir); err != nil {
			return err
		}
	}
	handler = api.Chain(handler,
		api.Recover(logger),
		api.Logger(logger),
		api.CORS(cfg.AllowedOrigins),
	)

	srv := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelWarn),
	}

	ln, err := net.Listen("tcp", cfg.Addr())
	if err != nil {
		return fmt.Errorf("listen on %s: %w", cfg.Addr(), err)
	}
	logger.Info("server listening",
		"addr", ln.Addr().String(),
		"allowed_origins", cfg.AllowedOrigins,
		"static_dir", cfg.StaticDir,
	)
	if ready != nil {
		ready <- ln.Addr().String()
	}

	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.Serve(ln) }()

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}

	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	if err := <-serveErr; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// probe performs a single health check against the server on the configured port.
func probe(getenv func(string) string) error {
	cfg, err := config.Load(getenv)
	if err != nil {
		return err
	}
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1" + cfg.Addr() + "/healthz")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("status %d", resp.StatusCode)
	}
	return nil
}
