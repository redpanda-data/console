package middleware

import "net/http"

// Interface is the shared contract for all middlesware, and allows middlesware
// to wrap handlers.
type Interface interface {
	Wrap(http.Handler) http.Handler
}
