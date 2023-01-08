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
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"go.uber.org/zap"
)

// handleFrontendIndex takes care of delivering the index.html file from the SPA. It has some
// special handling because we have a feature for URL rewrite (e.g. reverse proxy that wants to
// serve RP console under a different URL).
//
// This handler is called for all frontend resources that would return 404, so that an
// index.html file is served if an unknown URL is entered in the browser. All API requests
// that target /api/* are excluded from this behaviour.
func (api *API) handleFrontendIndex() http.HandlerFunc {
	basePathMarker := []byte(`__BASE_PATH_REPLACE_MARKER__`)
	enabledFeaturesMarker := []byte(`__FEATURES_REPLACE_MARKER__`)

	// Load index.html file
	indexOriginal, err := fs.ReadFile(api.FrontendResources, "index.html")
	if err != nil {
		api.Logger.Fatal("failed to load index.html from embedded filesystem", zap.Error(err))
	}
	enabledFeatures := strings.Join(api.Hooks.Console.EnabledFeatures(), ",")
	indexOriginal = bytes.ReplaceAll(indexOriginal, enabledFeaturesMarker, []byte(enabledFeatures))

	return func(w http.ResponseWriter, r *http.Request) {
		index := indexOriginal
		// If there's an active URL rewrite we need to replace the marker in the index.html with the
		// used base path so that the frontend knows what base URL to use for all subsequent requests.
		if basePath, ok := r.Context().Value(BasePathCtxKey).(string); ok && len(basePath) > 0 {

			// prefix must end with slash! otherwise the last segment gets cut off: 'a/b/c' -> "can't find host/a/b/resouce"
			if !strings.HasSuffix(basePath, "/") {
				basePath = basePath + "/"
			}
			// If we're running under a prefix, we need to let the frontend know
			// https://github.com/cloudhut/kowl/issues/107
			index = bytes.ReplaceAll(indexOriginal, basePathMarker, []byte(basePath))
		}

		hash := hashData(index)
		// For index.html we always set cache-control and etag
		w.Header().Set("Cache-Control", "public, max-age=900, must-revalidate") // 900s = 15m
		w.Header().Set("ETag", hash)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")

		// Check if the client sent 'If-None-Match' potentially return "304" (not mofified / unchanged)
		clientEtag := r.Header.Get("If-None-Match")
		if len(clientEtag) > 0 && hash == clientEtag {
			// Client already has the latest version of the file
			w.WriteHeader(http.StatusNotModified)
			return
		}

		if _, err := w.Write(index); err != nil {
			api.Logger.Error("failed to write index file to response writer", zap.Error(err))
		}
	}
}

func (api *API) handleFrontendResources() http.HandlerFunc {
	handleIndex := api.handleFrontendIndex()

	httpFs := http.FS(api.FrontendResources)
	fsHandler := http.StripPrefix("/", http.FileServer(httpFs))
	fileHashes, err := getHashes(api.FrontendResources)
	if err != nil {
		api.Logger.Fatal("failed to calculate file hashes", zap.Error(err))
	}

	return func(w http.ResponseWriter, r *http.Request) {
		if isRequestToIndexFile(r) {
			handleIndex(w, r)
			return
		}

		f, err := httpFs.Open(r.URL.Path)
		if err != nil {
			if os.IsNotExist(err) {
				api.Logger.Debug("requested file not found", zap.String("requestURI", r.RequestURI), zap.String("path", r.URL.Path))
			}
			handleIndex(w, r) // everything else goes to index as well
			return
		}
		defer f.Close()

		// Set correct content-type
		switch filepath.Ext(r.URL.Path) {
		case ".css":
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		case ".js":
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		}

		// Set Cache-Control and ETag
		w.Header().Set("Cache-Control", "public, max-age=900, must-revalidate") // 900s = 15min
		hash, hashFound := fileHashes[r.URL.Path]
		if hashFound {
			w.Header().Set("ETag", hash)
			clientEtag := r.Header.Get("If-None-Match")
			if len(clientEtag) > 0 && hash == clientEtag {
				// Client already has the latest version of the file
				w.WriteHeader(http.StatusNotModified)
				return
			}
		}

		fsHandler.ServeHTTP(w, r)
	}
}

// getHashes takes a filesystem, goes through all files
// in it recursively and calculates a sha256 for each one.
// It returns a map from file path to sha256 (already pre formatted in hex).
func getHashes(fsys fs.FS) (map[string]string, error) {
	fileHashes := make(map[string]string)
	err := fs.WalkDir(fsys, ".", func(path string, info fs.DirEntry, err error) error {
		if !info.IsDir() {
			fileBytes, err := fs.ReadFile(fsys, path)
			if err != nil {
				return fmt.Errorf("failed to open file %q: %w", path, err)
			}

			fileHashes[path] = hashData(fileBytes)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("Could not construct eTagCache, error while scanning files in directory: %w", err)
	}
	return fileHashes, nil
}

// hashData takes a byte array, calculates its sha256, and returns the hash as a hex encoded string
func hashData(data []byte) string {
	hasher := sha256.New()
	hasher.Write(data)
	hash := hasher.Sum(nil)
	return hex.EncodeToString(hash)
}

func isRequestToIndexFile(r *http.Request) bool {
	if strings.HasSuffix(r.URL.Path, "/index.html") {
		return true
	}

	if r.URL.Path == "/" {
		return true
	}

	return false
}
