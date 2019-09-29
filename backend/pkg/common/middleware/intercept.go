package middleware

import (
	"net/http"

	"github.com/go-chi/chi/middleware"
)

// Intercept attaches the chi response wrapper
func Intercept(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Wrap the response writer with the chi middleware.WrapResponseWrite type
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
	})
}
