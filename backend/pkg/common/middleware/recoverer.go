package middleware

import (
	"fmt"
	"net/http"

	"github.com/kafka-owl/kafka-owl/pkg/common/rest"
)

// Recoverer middleware logs unhandled panics and tries to continue running the API
type Recoverer struct {
	RestHelper *rest.Helper
}

// Wrap provides the actual middleware for recovering from panic
func (rec *Recoverer) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				w.Header().Set("Connection", "close")
				restErr := &rest.Error{
					Err:      fmt.Errorf("There was a panic! %s", err),
					Status:   http.StatusInternalServerError,
					Message:  "Internal Server Error",
					Type:     rest.TypeInternalServerError,
					IsSilent: false,
				}
				rec.RestHelper.SendRESTError(w, r, restErr)
			}
		}()

		next.ServeHTTP(w, r)
	})
}
