package api

import (
	"bytes"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"

	"go.uber.org/zap"
)

// handleGetIndex returns the SPA (index.html)
func (api *API) handleGetIndex(index []byte) http.HandlerFunc {
	srcAttribute := []byte(`src="/`)
	hrefAttribute := []byte(`href="/`)
	baseURLMarker := []byte(`__BASE_URL_REPLACE_MARKER__`)

	return func(w http.ResponseWriter, r *http.Request) {
		// check for 'X-Forwarded-Prefix' and if set,
		// add it as a prefix to all occurences of    (src="/)|(href="/)
		if xForwardedPrefixAr, exists := r.Header["X-Forwarded-Prefix"]; exists && len(xForwardedPrefixAr) > 0 {
			xForwardedPrefix := xForwardedPrefixAr[0]
			index = bytes.ReplaceAll(index, srcAttribute, []byte(fmt.Sprintf(`src="%s/`+xForwardedPrefix)))
			index = bytes.ReplaceAll(index, hrefAttribute, []byte(fmt.Sprintf(`href="%s/`+xForwardedPrefix)))
			index = bytes.ReplaceAll(index, baseURLMarker, []byte(xForwardedPrefix))
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

// getIndexFile loads the index.html or returns an error.
func (api *API) getIndexFile(filePath string) ([]byte, error) {
	indexPath := filePath + "/index.html"
	index, err := ioutil.ReadFile(indexPath)
	if err != nil {
		return nil, err
	}
	return index, nil
}
