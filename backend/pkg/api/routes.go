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
	baseRouter := chi.NewRouter()
	baseRouter.NotFound(rest.HandleNotFound(api.Logger))
	baseRouter.MethodNotAllowed(rest.HandleMethodNotAllowed(api.Logger))

	instrument := middleware.NewInstrument(api.Cfg.MetricsNamespace)
	recoverer := middleware.Recoverer{Logger: api.Logger}
	baseRouter.Use(recoverer.Wrap,
		chimiddleware.RealIP,
		chimiddleware.URLFormat,
		chimiddleware.StripSlashes, // Doesn't really help for the Frontend because the SPA is in charge of it
	)

	baseRouter.Group(func(router chi.Router) {
		// Init middlewares - Do any set up of shared/third-party middleware and handlers
		if api.Cfg.REST.CompressionLevel > 0 {
			api.Logger.Debug("using compression for all http routes", zap.Int("level", api.Cfg.REST.CompressionLevel))
			compressor := chimiddleware.NewCompressor(api.Cfg.REST.CompressionLevel)
			router.Use(compressor.Handler())
		}

		router.Use(
			middleware.Intercept,
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

			// Path must be prefixed with /debug otherwise it will be overridden, see: https://golang.org/pkg/net/http/pprof/
			r.Mount("/debug", chimiddleware.Profiler())
		})

		// API routes
		router.Group(func(r chi.Router) {
			api.Hooks.Route.ConfigAPIRouter(r)

			r.Route("/api", func(r chi.Router) {
				r.Get("/cluster", api.handleDescribeCluster())
				r.Get("/topics", api.handleGetTopics())
				r.Get("/topics/{topicName}/partitions", api.handleGetPartitions())
				r.Get("/topics/{topicName}/configuration", api.handleGetTopicConfig())
				r.Get("/topics/{topicName}/consumers", api.handleGetTopicConsumers())
				r.Get("/consumer-groups", api.handleGetConsumerGroups())
			})
		})

		if api.Cfg.ServeFrontend {
			// Check if the frontend directory 'build' exists
			dir, err := filepath.Abs(api.Cfg.FrontendPath)
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
	})

	// Websockets live in it's own group because not all middlewares support websockets
	baseRouter.Group(func(wsRouter chi.Router) {
		// We only want to call this function here (a second time!) because we configure middlewares in it. Specifically
		// the EnsureLoggedIn middleware. Without this middleware the session claims which are required for checking the
		// user permissions, can not be extracted anymore. This should be refactored into a better solution probably.
		// This could potentially lead to duplicate routes for the same endpoints.
		api.Hooks.Route.ConfigAPIRouter(wsRouter)

		wsRouter.Get("/api/topics/{topicName}/messages", api.handleGetMessages())
	})

	return baseRouter
}
