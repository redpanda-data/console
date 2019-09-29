package main

import (
	"path/filepath"
	"time"

	"github.com/go-chi/chi"
	chimiddleware "github.com/go-chi/chi/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/weeco/kafka-explorer/pkg/common/middleware"
	"go.uber.org/zap"
)

// All the routes for the application are defined in one place.
func (api *API) routes() *chi.Mux {

	// Set up the router
	router := chi.NewRouter()
	router.NotFound(api.restHelper.HandleNotFound())
	router.MethodNotAllowed(api.restHelper.HandleMethodNotAllowed())

	// Init middlewares
	// Do any set up of shared/third-party middleware and handlers
	instrument := middleware.NewInstrument(api.cfg.MetricsNamespace)
	recoverer := middleware.Recoverer{RestHelper: api.restHelper}
	router.Use(middleware.Intercept)
	router.Use(recoverer.Wrap)
	router.Use(chimiddleware.RealIP)
	router.Use(chimiddleware.URLFormat)
	router.Use(instrument.Wrap)
	router.Use(chimiddleware.Timeout(15 * time.Second))

	// Admin routes - only accessible from within Kubernetes or a protected ingress
	router.Route("/admin", func(r chi.Router) {
		r.Handle("/metrics", promhttp.Handler())
	})
	// Path must be prefixed with /debug otherwise it will be overriden, see: https://golang.org/pkg/net/http/pprof/
	router.Mount("/debug", chimiddleware.Profiler())

	// REST API Endpoints
	router.Route("/api", func(r chi.Router) {
		r.Get("/cluster", api.handleDescribeCluster())
		r.Get("/topics", api.handleGetTopics())
		r.Get("/topics/{topicName}/messages", api.handleGetMessages())
		r.Get("/topics/{topicName}/configuration", api.handleGetTopicConfig())
		r.Get("/consumer-groups", api.handleGetConsumerGroups())
	})

	if api.cfg.ServeFrontend {
		// Check if the build directory exists
		dir, err := filepath.Abs("./build")
		if err != nil {
			api.logger.Fatal("given frontend directory is invalid", zap.String("directory", dir), zap.Error(err))
			return router
		}

		// SPA Files
		index := api.getIndexFile(dir)
		router.Group(func(router chi.Router) {
			router.Use(cache)

			router.Get("/", api.handleGetIndex(index))
			router.Get("/*", api.handleGetStaticFile(index, dir))
		})
	} else {
		api.logger.Info("no static files will be served as serving the frontend has been disabled")
	}

	return router
}
