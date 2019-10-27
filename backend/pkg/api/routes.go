package api

import (
	"os"
	"path/filepath"
	"time"

	healthhttp "github.com/AppsFlyer/go-sundheit/http"
	"github.com/go-chi/chi"
	chimiddleware "github.com/go-chi/chi/middleware"
	"github.com/kafka-owl/kafka-owl/pkg/common/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
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

	if api.cfg.REST.CompressionLevel > 0 {
		api.logger.Debug("using compression for all http routes", zap.Int("level", api.cfg.REST.CompressionLevel))
		router.Use(chimiddleware.Compress(api.cfg.REST.CompressionLevel))
	}
	router.Use(middleware.Intercept)
	router.Use(recoverer.Wrap)
	router.Use(chimiddleware.RealIP)
	router.Use(chimiddleware.URLFormat)

	router.Use(instrument.Wrap)
	router.Use(chimiddleware.Timeout(15 * time.Second))

	// Admin routes - only accessible from within Kubernetes or a protected ingress
	router.Route("/admin", func(r chi.Router) {
		r.Handle("/metrics", promhttp.Handler())
		r.Handle("/health", healthhttp.HandleHealthJSON(api.health))
	})
	// Path must be prefixed with /debug otherwise it will be overriden, see: https://golang.org/pkg/net/http/pprof/
	router.Mount("/debug", chimiddleware.Profiler())

	// REST API Endpoints
	router.Route("/api", func(r chi.Router) {
		r.Get("/cluster", api.handleDescribeCluster())
		r.Get("/topics", api.handleGetTopics())
		r.Get("/topics/{topicName}/partitions", api.handleGetPartitions())
		r.Get("/topics/{topicName}/messages", api.handleGetMessages())
		r.Get("/topics/{topicName}/configuration", api.handleGetTopicConfig())
		r.Get("/consumer-groups", api.handleGetConsumerGroups())
	})

	// OAuth
	// auth := NewAuth(api.logger)
	// auth.AddRoutes(router)
	// router.HandleFunc("/oauth2callback", auth.oAuthCallback)

	if api.cfg.REST.ServeFrontend {
		// Check if the frontend directory 'build' exists
		dir, err := filepath.Abs("./build")
		if err != nil {
			api.logger.Fatal("given frontend directory is invalid", zap.String("directory", dir), zap.Error(err))
			return router
		}

		// SPA Files
		index, err := api.getIndexFile(dir)
		if err != nil {
			api.logger.Fatal("cannot load frontend index file", zap.String("directory", dir), zap.Error(err))
			os.Exit(1)
		}
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
