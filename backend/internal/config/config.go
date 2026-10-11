// Package config loads server configuration from environment variables.
package config

import (
	"fmt"
	"strconv"
	"strings"
)

// Defaults used when the corresponding variable is unset or empty.
const (
	DefaultPort           = 8080
	DefaultAllowedOrigins = "http://localhost:5173"
)

// Config holds the runtime settings of the server.
type Config struct {
	// Port is the TCP port to listen on (PORT).
	Port int
	// AllowedOrigins lists the browser origins allowed by CORS
	// (ALLOWED_ORIGINS, comma separated; "*" allows any origin).
	AllowedOrigins []string
}

// Addr returns the listen address for Port.
func (c Config) Addr() string { return ":" + strconv.Itoa(c.Port) }

// Load reads the configuration through getenv, which is usually os.Getenv.
// Taking it as a parameter keeps Load free of global state in tests.
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{Port: DefaultPort}

	if raw := strings.TrimSpace(getenv("PORT")); raw != "" {
		port, err := strconv.Atoi(raw)
		if err != nil || port < 1 || port > 65535 {
			return Config{}, fmt.Errorf("invalid PORT %q: must be an integer between 1 and 65535", raw)
		}
		cfg.Port = port
	}

	origins := getenv("ALLOWED_ORIGINS")
	if strings.TrimSpace(origins) == "" {
		origins = DefaultAllowedOrigins
	}
	for _, o := range strings.Split(origins, ",") {
		if o = strings.TrimRight(strings.TrimSpace(o), "/"); o != "" {
			cfg.AllowedOrigins = append(cfg.AllowedOrigins, o)
		}
	}

	return cfg, nil
}
