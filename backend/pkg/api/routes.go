package api

import (
	"path/filepath"
	"time"

	healthhttp "github.com/AppsFlyer/go-sundheit/http"
	"github.com/cloudhut/common/middleware"
	"github.com/cloudhut/common/rest"
	"github.com/go-chi/chi"
	chimiddleware "github.com/go-chi/chi/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
)

// All the routes for the application are defined in one place.
func (api *API) routes() *chi.Mux {
	router := chi.NewRouter()
	router.NotFound(rest.HandleNotFound(api.Logger))
	router.MethodNotAllowed(rest.HandleMethodNotAllowed(api.Logger))

	// Init middlewares - Do any set up of shared/third-party middleware and handlers
	if api.Cfg.REST.CompressionLevel > 0 {
		api.Logger.Debug("using compression for all http routes", zap.Int("level", api.Cfg.REST.CompressionLevel))
		compressor := chimiddleware.NewCompressor(api.Cfg.REST.CompressionLevel)
		router.Use(compressor.Handler())
	}

	instrument := middleware.NewInstrument(api.Cfg.MetricsNamespace)
	recoverer := middleware.Recoverer{Logger: api.Logger}
	router.Use(
		middleware.Intercept,
		recoverer.Wrap,
		chimiddleware.RealIP,
		chimiddleware.URLFormat,
		chimiddleware.StripSlashes,
		instrument.Wrap,
		chimiddleware.Timeout(15*time.Second),
	)

	// This should be called here so that you can still add middlewares in the hook function.
	// Middlewares must be defined before routes.
	api.Hooks.Route.ConfigRouter(router)

	// Private routes - these should only be accessible from within Kubernetes or a protected ingress
	router.Group(func(r chi.Router) {
		r.Route("/admin", func(r chi.Router) {
			r.Handle("/metrics", promhttp.Handler())
			r.Handle("/health", healthhttp.HandleHealthJSON(api.health))
		})

		// Path must be prefixed with /debug otherwise it will be overriden, see: https://golang.org/pkg/net/http/pprof/
		r.Mount("/debug", chimiddleware.Profiler())
	})

	// API routes
	router.Group(func(r chi.Router) {
		api.Hooks.Route.ConfigAPIRouter(r)

		r.Route("/api", func(r chi.Router) {
			r.Get("/cluster", api.handleDescribeCluster())
			r.Get("/topics", api.handleGetTopics())
			r.Get("/topics/{topicName}/partitions", api.handleGetPartitions())
			r.Get("/topics/{topicName}/messages", api.handleGetMessages())
			r.Get("/topics/{topicName}/configuration", api.handleGetTopicConfig())
			r.Get("/consumer-groups", api.handleGetConsumerGroups())
		})
	})

	if api.Cfg.ServeFrontend {
		// Check if the frontend directory 'build' exists
		dir, err := filepath.Abs("./build")
		if err != nil {
			api.Logger.Fatal("given frontend directory is invalid", zap.String("directory", dir), zap.Error(err))
		}

		// SPA Files
		index, err := api.getIndexFile(dir)
		if err != nil {
			api.Logger.Fatal("cannot load frontend index file", zap.String("directory", dir), zap.Error(err))
		}
		router.Group(func(r chi.Router) {
			r.Use(cache)

			r.Get("/", api.handleGetIndex(index))
			r.Get("/*", api.handleGetStaticFile(index, dir))
		})
	} else {
		api.Logger.Info("no static files will be served as serving the frontend has been disabled")
	}

	return router
}
