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
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi"
)

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

// Creates a middlware that adds 'app-version' as a header to each response:
// - app-build-time     (unix timestamp)
// - app-sha            (git sha)
// - app-branch         (git branch)
// - app-sha-business   (git sha)
// - app-branch-busines (git branch)
// The frontend uses this object to detect if the backend server has been updated
// todo: can be optimized later; only buildTime is really needed, after that the frontend could check another endpoint (something like /api/version)
func createSetVersionInfoHeader(version versionInfo) func(next http.Handler) http.Handler {
	buildTimestamp := version.timestamp
	if buildTimestamp.IsZero() {
		buildTimestamp = time.Now()
	}

	versionInfo := struct {
		BuildTime      string `json:"ts,omitempty"`
		Branch         string `json:"branch,omitempty"`
		Sha            string `json:"sha,omitempty"`
		BranchBusiness string `json:"branchBusiness,omitempty"`
		ShaBusiness    string `json:"shaBusiness,omitempty"`
	}{
		BuildTime:      fmt.Sprintf("%v", buildTimestamp.Unix()),
		Branch:         version.gitRef,
		Sha:            version.gitSha,
		BranchBusiness: version.gitRefBusiness,
		ShaBusiness:    version.gitShaBusiness,
	}
	versionInfoJSONBytes, err := json.Marshal(versionInfo)
	versionInfoJSON := string(versionInfoJSONBytes)

	if err != nil {
		panic(fmt.Errorf("Could not construct versionInfo object from: %v", versionInfo))
	}

	m := func(next http.Handler) http.Handler {
		fn := func(w http.ResponseWriter, r *http.Request) {
			w.Header().Add("app-version", versionInfoJSON)
			next.ServeHTTP(w, r)
		}
		return http.HandlerFunc(fn)
	}

	return m
}
