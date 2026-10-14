package config

import (
	"fmt"
	"strconv"
	"strings"
)

const (
	DefaultPort           = 8080
	DefaultAllowedOrigins = "http://localhost:5173"
)

type Config struct {
	Port           int
	AllowedOrigins []string
	StaticDir      string
}

func (c Config) Addr() string { return ":" + strconv.Itoa(c.Port) }

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

	cfg.StaticDir = strings.TrimSpace(getenv("STATIC_DIR"))

	return cfg, nil
}
