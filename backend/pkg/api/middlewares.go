// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

var (
	// BasePathCtxKey is a helper to avoid allocations, idea taken from chi
	BasePathCtxKey = &struct{ name string }{"ConsoleURLPrefix"}
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

			// If we have a prefix...
			if len(prefix) > 0 {
				// ensure correct prefix slashes
				prefix = ensurePrefixFormat(prefix)

				// Store prefix in context so handle_frontend can use it to inject it into the html
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
					if strings.HasPrefix(path, prefix) {
						rctx.RoutePath = "/" + strings.TrimPrefix(path, prefix)
					}

					// URL.path
					if strings.HasPrefix(r.URL.Path, prefix) {
						r.URL.Path = "/" + strings.TrimPrefix(r.URL.Path, prefix)
					}

					// requestURI
					if strings.HasPrefix(r.RequestURI, prefix) {
						r.RequestURI = "/" + strings.TrimPrefix(r.RequestURI, prefix)
					}
				}
			}

			next.ServeHTTP(w, r)
		}
		return http.HandlerFunc(fn)
	}
}

func requirePrefix(prefix string) func(http.Handler) http.Handler {
	prefix = ensurePrefixFormat(prefix)
	prefix = strings.TrimSuffix(prefix, "/") // don't require trailing slash

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

// prefix must start and end with a slash
func ensurePrefixFormat(path string) string {
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

// Creates a middleware that adds the build timestamp as a header to each response.
// The frontend uses this object to detect if the backend server has been updated,
// and therefore knows when the Single Page Application should be reloaded as well.
func createSetVersionInfoHeader(builtAt string) func(next http.Handler) http.Handler {
	buildTimestamp := time.Now()
	// Try to parse given string from ldflags as a timestamp
	if timestampInt, err := strconv.Atoi(builtAt); err == nil {
		buildTimestamp = time.Unix(int64(timestampInt), 0)
	}

	return func(next http.Handler) http.Handler {
		fn := func(w http.ResponseWriter, r *http.Request) {
			w.Header().Add("app-build-timestamp", strconv.Itoa(int(buildTimestamp.Unix())))
			next.ServeHTTP(w, r)
		}
		return http.HandlerFunc(fn)
	}
}
