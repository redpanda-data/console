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
	mux := chi.NewRouter()
	mux.NotFound(api.restHelper.HandleNotFound())
	mux.MethodNotAllowed(api.restHelper.HandleMethodNotAllowed())
	var rootRouter chi.Router = mux

	// Init middlewares
	// Do any set up of shared/third-party middleware and handlers
	instrument := middleware.NewInstrument(api.cfg.MetricsNamespace)
	recoverer := middleware.Recoverer{RestHelper: api.restHelper}

	if api.cfg.REST.CompressionLevel > 0 {
		api.Logger.Debug("using compression for all http routes", zap.Int("level", api.cfg.REST.CompressionLevel))
		rootRouter.Use(chimiddleware.Compress(api.cfg.REST.CompressionLevel))
	}
	rootRouter.Use(middleware.Intercept)
	rootRouter.Use(recoverer.Wrap)
	rootRouter.Use(chimiddleware.RealIP)
	rootRouter.Use(chimiddleware.URLFormat)

	rootRouter.Use(instrument.Wrap)
	rootRouter.Use(chimiddleware.Timeout(15 * time.Second))

	if api.cfg.Logger.PrintAccessLogs {
		a := middleware.NewAccessLog(api.Logger)
		rootRouter.Use(a.Wrap)
	}

	// Private routes - these should only be accessible from within Kubernetes or a protected ingress
	rootRouter.Group(func(r chi.Router) {
		r.Route("/admin", func(r chi.Router) {
			r.Handle("/metrics", promhttp.Handler())
			r.Handle("/health", healthhttp.HandleHealthJSON(api.health))
		})

		// Path must be prefixed with /debug otherwise it will be overriden, see: https://golang.org/pkg/net/http/pprof/
		r.Mount("/debug", chimiddleware.Profiler())
	})

	// API routes
	rootRouter.Group(func(r chi.Router) {
		api.hooks.Route.ConfigAPIRouter(r)

		// REST API Endpoints
		r.Route("/api", func(r chi.Router) {
			r.Get("/cluster", api.handleDescribeCluster())
			r.Get("/topics", api.handleGetTopics())
			r.Get("/topics/{topicName}/partitions", api.handleGetPartitions())
			r.Get("/topics/{topicName}/messages", api.handleGetMessages())
			r.Get("/topics/{topicName}/configuration", api.handleGetTopicConfig())
			r.Get("/consumer-groups", api.handleGetConsumerGroups())
		})
	})

	if api.cfg.REST.ServeFrontend {
		// Check if the frontend directory 'build' exists
		dir, err := filepath.Abs("./build")
		if err != nil {
			api.Logger.Fatal("given frontend directory is invalid", zap.String("directory", dir), zap.Error(err))
			os.Exit(1)
		}

		// SPA Files
		index, err := api.getIndexFile(dir)
		if err != nil {
			api.Logger.Fatal("cannot load frontend index file", zap.String("directory", dir), zap.Error(err))
			os.Exit(1)
		}
		rootRouter.Group(func(r chi.Router) {
			api.hooks.Route.ConfigFrontendRouter(r)
			r.Use(cache)

			r.Get("/", api.handleGetIndex(index))
			r.Get("/*", api.handleGetStaticFile(index, dir))
		})
	} else {
		api.Logger.Info("no static files will be served as serving the frontend has been disabled")
	}

	return mux
}
