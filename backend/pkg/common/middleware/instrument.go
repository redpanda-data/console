package middleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi"
	"github.com/go-chi/chi/middleware"

	"github.com/prometheus/client_golang/prometheus"
)

// Instrument is a middleware which creates a request duration historgram for every
// incoming HTTP request
type Instrument struct {
	duration *prometheus.HistogramVec
}

// NewInstrument creates a prometheus preinitialized instance which then can be used to
// bind a middleware to a router
func NewInstrument(metricsNamespace string) *Instrument {
	// DefBuckets are histogram buckets for the response time (in seconds)
	// of a network service, including one that is responding very slowly.
	buckets := []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10, 25, 50, 100}
	requestDuration := prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: metricsNamespace,
		Name:      "request_duration_seconds",
		Help:      "Time (in seconds) spent serving HTTP requests.",
		Buckets:   buckets,
	}, []string{"method", "route", "status_code"})
	prometheus.MustRegister(requestDuration)

	return &Instrument{
		duration: requestDuration,
	}
}

// Wrap implements the middleware interface
func (i *Instrument) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)

		ww, ok := w.(middleware.WrapResponseWriter)
		if !ok {
			panic("could not convert to middleware.WrapResponseWriter")
		}
		duration := time.Since(start)
		status := strconv.Itoa(ww.Status())
		route := i.getRoutePattern(r)
		i.duration.WithLabelValues(r.Method, route, status).Observe(duration.Seconds())
	})
}

// getRoutePattern returns the route pattern of the requested URL, so that we can use
// them as prometheus label without ending up with thousands of different metric serieses
// due to tons of different labels. Get route patterns like this:
// a) The request matches a static route "/api/health", return that.
// b) The request matches a dynamic route "/users/:userId/billing-history", return the
// 	  route pattern: "users_user_id_billing_history"
// c) The requests did not match any route handlers, return "other"
func (i *Instrument) getRoutePattern(r *http.Request) string {
	rctx := chi.RouteContext(r.Context())
	if pattern := rctx.RoutePattern(); pattern != "" {
		return pattern
	}

	return "other"
}
