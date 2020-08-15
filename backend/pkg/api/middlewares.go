package api

import (
	"context"
	"net/http"
	"strings"

	"github.com/go-chi/chi"
)

func cache(h http.Handler) http.Handler {
	fn := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "max-age=2592000")
		h.ServeHTTP(w, r)
	}

	return http.HandlerFunc(fn)
}

var (
	// helper to avoid allocations, idea taken from chi
	BasePathCtxKey = &struct{ name string }{"KowlURLPrefix"}
)

// Uses checks if X-Forwarded-Prefix or settings.basePath are set,
// and then strips the set prefix from any requests.
// When a prefix is set, this function adds it under the key 'BasePathCtxKey' to the context
func createHandleBasePathMiddleware(basePath string, useXForwardedPrefix bool, stripPrefix bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		fn := func(w http.ResponseWriter, r *http.Request) {
			prefix := ""

			// Static base path (from settings)
			if len(basePath) > 0 {
				prefix = basePath
			}

			// Dynamic base path (from header)
			if useXForwardedPrefix {
				xForwardedPrefix := r.Header.Get("X-Forwarded-Prefix")
				if len(xForwardedPrefix) > 0 {
					prefix = xForwardedPrefix
				}
			}

			// If we have a basePath...
			if len(basePath) > 0 {
				// ensure correct prefix slashes
				basePath = ensureBasePathFormat(basePath)

				// Store basePath in context so handle_frontend can use it to inject it into the html
				r = r.WithContext(context.WithValue(r.Context(), BasePathCtxKey, prefix))

				// Remove it from the request url (if allowed by settings)
				if stripPrefix {
					var path string
					rctx := chi.RouteContext(r.Context())
					if rctx.RoutePath != "" {
						path = rctx.RoutePath
					} else {
						path = r.URL.Path
					}

					// route path
					if strings.HasPrefix(path, basePath) {
						rctx.RoutePath = "/" + strings.TrimPrefix(path, basePath)
					}

					// URL.path
					if strings.HasPrefix(r.URL.Path, basePath) {
						r.URL.Path = "/" + strings.TrimPrefix(r.URL.Path, basePath)
					}

					// requestURI
					if strings.HasPrefix(r.RequestURI, basePath) {
						r.RequestURI = "/" + strings.TrimPrefix(r.RequestURI, basePath)
					}

					// fmt.Println("url path: " + r.URL.Path)
					// fmt.Println("requestURI: " + r.RequestURI)
					// fmt.Println("url rawPath: " + r.URL.RawPath)
					// fmt.Println("")

				}
			}

			next.ServeHTTP(w, r)
		}
		return http.HandlerFunc(fn)
	}
}

func requirePrefix(prefix string) func(http.Handler) http.Handler {
	prefix = ensureBasePathFormat(prefix)
	return func(next http.Handler) http.Handler {
		fn := func(w http.ResponseWriter, r *http.Request) {

			if !strings.HasPrefix(r.RequestURI, prefix) {
				w.WriteHeader(http.StatusNotFound)
				return
			}

			next.ServeHTTP(w, r)
		}
		return http.HandlerFunc(fn)
	}
}

// basePath must start and end with a slash
func ensureBasePathFormat(path string) string {
	if len(path) == 0 || (len(path) == 1 && path[0] == '/') {
		return "" // nil / empty / slash
	}

	// add leading slash
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	// add trailing slash
	if !strings.HasSuffix(path, "/") {
		path = path + "/"
	}

	return path
}

/*
path := r.URL.Path

if strings.Index(path, ".") > 0 {
	base := strings.LastIndex(path, "/")
	idx := strings.Index(path[base:], ".")

	if idx > 0 {
		idx += base
		format = path[idx+1:]

		rctx := chi.RouteContext(r.Context())
		rctx.RoutePath = path[:idx]
	}
}

r = r.WithContext(context.WithValue(ctx, URLFormatCtxKey, format))

next.ServeHTTP(w, r)

*/
