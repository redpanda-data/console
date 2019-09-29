package main

import "net/http"

func cache(h http.Handler) http.Handler {
	fn := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "max-age=2592000")
		h.ServeHTTP(w, r)
	}

	return http.HandlerFunc(fn)
}
