package config

import (
	"slices"
	"testing"
)

func env(vars map[string]string) func(string) string {
	return func(key string) string { return vars[key] }
}

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(env(nil))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != DefaultPort {
		t.Errorf("Port = %d, want %d", cfg.Port, DefaultPort)
	}
	if cfg.Addr() != ":8080" {
		t.Errorf("Addr() = %q, want :8080", cfg.Addr())
	}
	if !slices.Equal(cfg.AllowedOrigins, []string{DefaultAllowedOrigins}) {
		t.Errorf("AllowedOrigins = %v, want [%s]", cfg.AllowedOrigins, DefaultAllowedOrigins)
	}
	if cfg.StaticDir != "" {
		t.Errorf("StaticDir = %q, want empty", cfg.StaticDir)
	}
}

func TestLoadOverrides(t *testing.T) {
	cfg, err := Load(env(map[string]string{
		"PORT":            " 9090 ",
		"ALLOWED_ORIGINS": "https://a.example, https://b.example/ ,,",
		"STATIC_DIR":      "/srv/www",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != 9090 {
		t.Errorf("Port = %d, want 9090", cfg.Port)
	}
	if cfg.StaticDir != "/srv/www" {
		t.Errorf("StaticDir = %q, want /srv/www", cfg.StaticDir)
	}
	want := []string{"https://a.example", "https://b.example"}
	if !slices.Equal(cfg.AllowedOrigins, want) {
		t.Errorf("AllowedOrigins = %v, want %v", cfg.AllowedOrigins, want)
	}
}

func TestLoadInvalidPort(t *testing.T) {
	for _, port := range []string{"abc", "0", "-1", "65536", "80.5"} {
		t.Run(port, func(t *testing.T) {
			if _, err := Load(env(map[string]string{"PORT": port})); err == nil {
				t.Errorf("PORT=%q: expected error", port)
			}
		})
	}
}
