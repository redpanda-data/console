package api

import (
	"bytes"
	"io/ioutil"
	"net/http"
	"os"

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
			// If we're running under a prefix, we need to let the frontend know
			// https://github.com/cloudhut/kowl/issues/107
			index = bytes.ReplaceAll(indexOriginal, basePathMarker, []byte(basePath))
		} else {
			// no change
			index = indexOriginal
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

	handleFrontendResources = func(w http.ResponseWriter, r *http.Request) {
		f, err := root.Open(r.RequestURI)
		if os.IsNotExist(err) {
			api.Logger.Debug("requested file not found", zap.String("file", r.RequestURI))
			handleIndex(w, r) // everything else goes to index as well
			return
		}
		defer f.Close()

		fs.ServeHTTP(w, r)
	}

	return
}
