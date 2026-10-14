package api

import (
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"
)

func WithStatic(apiHandler http.Handler, dir string) (http.Handler, error) {
	fsys := os.DirFS(dir)
	if _, err := fs.Stat(fsys, "index.html"); err != nil {
		return nil, fmt.Errorf("static dir %q: %w", dir, err)
	}

	mux := http.NewServeMux()
	mux.Handle("/api/", apiHandler)
	mux.Handle("/healthz", apiHandler)
	mux.Handle("/", spaHandler(fsys))
	return mux, nil
}

func spaHandler(fsys fs.FS) http.Handler {
	files := http.FileServerFS(fsys)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
			return
		}

		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		info, err := fs.Stat(fsys, name)
		if name == "" || errors.Is(err, fs.ErrNotExist) || (err == nil && info.IsDir()) {
			serveIndex(w, r, fsys)
			return
		}

		// Vite fingerprints files under assets/, so they never change.
		if strings.HasPrefix(name, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		files.ServeHTTP(w, r)
	})
}

func serveIndex(w http.ResponseWriter, r *http.Request, fsys fs.FS) {
	// index.html points at the current asset hashes, so it must always be revalidated.
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeFileFS(w, r, fsys, "index.html")
}
