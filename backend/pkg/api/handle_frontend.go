package api

import (
	"bytes"
	"io/ioutil"
	"net/http"
	"os"

	"go.uber.org/zap"
)

var (
	/// DEBUG
	forcedPrefix = "rararara/kowl/abc/"
)

// handleGetIndex returns the SPA (index.html)
func (api *API) handleGetIndex(index []byte) http.HandlerFunc {
	// srcAttribute := []byte(`src="/`)
	// hrefAttribute := []byte(`href="/`)
	basePathMarker := []byte(`__BASE_PATH_REPLACE_MARKER__`)

	return func(w http.ResponseWriter, r *http.Request) {

		if basePath, ok := r.Context().Value(BasePathCtxKey).(string); ok && len(basePath) > 0 {
			// check if there's a prefix we have to set and add it to all occurences of (src="/)|(href="/)
			// https://github.com/cloudhut/kowl/issues/107

			//
			// TODO: do we still need to modify all src/href?
			//		 we're now setting homepage:'.', so maybe we only have to insert the base path marker?
			//
			index = bytes.ReplaceAll(index, basePathMarker, []byte(basePath))
			// index = bytes.ReplaceAll(index, srcAttribute, []byte(fmt.Sprintf(`src="%s/`+basePath)))
			// index = bytes.ReplaceAll(index, hrefAttribute, []byte(fmt.Sprintf(`href="%s/`+basePath)))
		}

		_, err := w.Write(index)
		if err != nil {
			api.Logger.Error("failed to write index file to response writer", zap.Error(err))
		}
	}
}

// handleGetStaticFile tries to open the requested file. If this file does not exist it will return the
// SPA (index.html) instead.
func (api *API) handleGetStaticFile(handleGetIndex http.HandlerFunc, rootPath string) http.HandlerFunc {
	root := http.Dir(rootPath)
	fs := http.StripPrefix("/", http.FileServer(root))

	return func(w http.ResponseWriter, r *http.Request) {
		f, err := root.Open(r.RequestURI)
		if os.IsNotExist(err) {
			api.Logger.Debug("requested file not found", zap.String("file", r.RequestURI))
			// everything else goes to index as well

			handleGetIndex(w, r)
			return
		}
		defer f.Close()

		fs.ServeHTTP(w, r)
	}
}

// loadIndexFile loads the index.html or returns an error.
func (api *API) loadIndexFile(filePath string) ([]byte, error) {
	indexPath := filePath + "/index.html"
	index, err := ioutil.ReadFile(indexPath)
	if err != nil {
		return nil, err
	}
	return index, nil
}
