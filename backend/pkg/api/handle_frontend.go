package api

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"go.uber.org/zap"
)

// createFrontendHandlers creates two handlers: one to handle the '/' route and one to handle any other route
func (api *API) createFrontendHandlers(frontendDir string) (handleIndex http.HandlerFunc, handleFrontendResources http.HandlerFunc) {
	indexPath := frontendDir + "/index.html"
	indexOriginal, err := ioutil.ReadFile(indexPath)
	if err != nil {
		api.Logger.Fatal("cannot load frontend index file", zap.String("directory", frontendDir), zap.Error(err))
		return nil, nil
	}

	basePathMarker := []byte(`__BASE_PATH_REPLACE_MARKER__`)

	//
	// 1. handler for '/' returning index.html
	//
	handleIndex = func(w http.ResponseWriter, r *http.Request) {
		var index []byte

		if basePath, ok := r.Context().Value(BasePathCtxKey).(string); ok && len(basePath) > 0 {

			// prefix must end with slash! otherwise the last segment gets cut off: 'a/b/c' -> "can't find host/a/b/resouce"
			if !strings.HasSuffix(basePath, "/") {
				basePath = basePath + "/"
			}
			// If we're running under a prefix, we need to let the frontend know
			// https://github.com/cloudhut/kowl/issues/107
			index = bytes.ReplaceAll(indexOriginal, basePathMarker, []byte(basePath))
		} else {
			// no change
			index = indexOriginal
		}

		hash := hashData(index)
		// For index.html we always set cache-control and etag
		w.Header().Set("Cache-Control", "public, max-age=900, must-revalidate") // 900s = 15m
		w.Header().Set("ETag", hash)

		// Check if the client sent 'If-None-Match' potentially return "304" (not mofified / unchanged)
		clientEtag := r.Header.Get("If-None-Match")
		if len(clientEtag) > 0 && hash == clientEtag {
			// Client already has the latest version of the file
			w.WriteHeader(http.StatusNotModified)
			return
		}

		_, err := w.Write(index)
		if err != nil {
			api.Logger.Error("failed to write index file to response writer", zap.Error(err))
		}
	}

	//
	// 2. handler for any other path, returning the static file or fallback to index
	//
	root := http.Dir(frontendDir)
	fs := http.StripPrefix("/", http.FileServer(root))

	// pre calculate hashes for all files in the given directory
	fileHashes := hashFilesInDirectory(frontendDir)

	handleFrontendResources = func(w http.ResponseWriter, r *http.Request) {
		f, err := root.Open(r.URL.Path)
		if err != nil {
			if os.IsNotExist(err) {
				api.Logger.Debug("requested file not found", zap.String("requestURI", r.RequestURI), zap.String("path", r.URL.Path))
			}
			handleIndex(w, r) // everything else goes to index as well
			return
		}
		defer f.Close()

		// Set Cache-Control and ETag
		hash, hashFound := fileHashes[r.URL.Path]
		w.Header().Set("Cache-Control", "public, max-age=900, must-revalidate") // 900s = 15min
		if hashFound {
			w.Header().Set("ETag", hash)
			clientEtag := r.Header.Get("If-None-Match")
			if len(clientEtag) > 0 && hash == clientEtag {
				// Client already has the latest version of the file
				w.WriteHeader(http.StatusNotModified)
				return
			}
		}

		fs.ServeHTTP(w, r)
	}

	return
}

// hashFilesInDirectory takes a directory, goes through all files
// in it recursively and calculates a sha256 for each one.
// It returns a map from file path to sha256 (already pre formatted in hex).
func hashFilesInDirectory(directory string) map[string]string {
	// expand directory name in case it contains '..' or something
	absDir, err := filepath.Abs(directory)
	if err != nil {
		panic(fmt.Errorf("hashFilesInDirectory cannot build absolute path from '%v'", directory))
	}

	fileHashes := make(map[string]string)
	err = filepath.Walk(absDir, func(path string, info os.FileInfo, err error) error {
		// ignore base directory, replace backslash with forward slash
		filePath := strings.TrimPrefix(path, absDir)
		filePath = strings.ReplaceAll(filePath, "\\", "/")

		if !info.IsDir() {
			fileHashes[filePath] = hashFile(path)
		}
		return nil
	})

	if err != nil {
		panic(fmt.Errorf("Could not construct eTagCache, error while scanning files in directory '%v': %v", directory, err))
	}

	return fileHashes
}

func hashFile(filePath string) string {
	fileData, err := ioutil.ReadFile(filePath)
	if err != nil {
		panic(fmt.Errorf("Could read file to calculate sha256 for file '%v': %v", filePath, err))
	}

	return hashData(fileData)
}

// hashData takes a byte array, calculates its sha256, and returns the hash as a hex encoded string
func hashData(data []byte) string {
	hasher := sha256.New()
	hasher.Write(data)
	hash := hasher.Sum(nil)
	return hex.EncodeToString(hash)
}
