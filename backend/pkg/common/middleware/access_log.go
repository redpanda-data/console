package middleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/middleware"
	"go.uber.org/zap"
)

// AccessLog implements the middleware interface
type AccessLog struct {
	logger *zap.Logger
}

// NewAccessLog creates a new middleware which prints access logs
func NewAccessLog(logger *zap.Logger) *AccessLog {
	return &AccessLog{
		logger: logger,
	}
}

// Wrap implements the middleware interface
func (a *AccessLog) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		next.ServeHTTP(w, r)

		ww, ok := w.(middleware.WrapResponseWriter)
		if !ok {
			panic("could not convert to middleware.WrapResponseWriter")
		}

		duration := time.Since(start)
		durationMs := duration.Nanoseconds() / (1000 * 1000)

		a.logger.Info(
			"",
			zap.String("log_type", "access"),
			zap.String("remote_address", r.RemoteAddr),
			zap.Int64("response_time", durationMs),
			zap.String("protocol", r.Proto),
			zap.String("request_method", r.Method),
			zap.String("query_string", r.URL.RawQuery),
			zap.String("status", strconv.Itoa(ww.Status())),
			zap.String("uri", r.URL.Path),
			zap.String("server_name", r.URL.Host),
			zap.Int64("bytes_received", r.ContentLength),
			zap.Int("bytes_sent", ww.BytesWritten()),
			zap.String("remote_client_id", r.Header.Get("remoteClientId")),
		)
	})
}
