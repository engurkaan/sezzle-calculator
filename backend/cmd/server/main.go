// Command server runs the calculator REST API.
package main

import (
	"context"
	"errors"
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

	handler := api.Chain(api.NewHandler(),
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
	logger.Info("server listening", "addr", ln.Addr().String(), "allowed_origins", cfg.AllowedOrigins)
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
