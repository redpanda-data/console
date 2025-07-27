// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package api is the first layer that processes an incoming HTTP request. It is in charge
// of validating the user input, verifying whether the user is authorized (by calling hooks),
// as well as setting up all the routes and dependencies for subsequently called
// route handlers & services.
package api

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"time"

	"github.com/cloudhut/common/rest"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/connect"
	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/embed"
	kafkafactory "github.com/redpanda-data/console/backend/pkg/factory/kafka"
	redpandafactory "github.com/redpanda-data/console/backend/pkg/factory/redpanda"
	schemafactory "github.com/redpanda-data/console/backend/pkg/factory/schema"
	"github.com/redpanda-data/console/backend/pkg/git"
	"github.com/redpanda-data/console/backend/pkg/license"
	loggerpkg "github.com/redpanda-data/console/backend/pkg/logger"
	"github.com/redpanda-data/console/backend/pkg/version"
)

// API represents the server and all its dependencies to serve incoming user requests
type API struct {
	Cfg *config.Config

	Logger     *slog.Logger
	ConsoleSvc console.Servicer
	ConnectSvc *connect.Service
	GitSvc     *git.Service

	RedpandaClientProvider redpandafactory.ClientFactory
	KafkaClientProvider    kafkafactory.ClientFactory
	SchemaClientProvider   schemafactory.ClientFactory

	// FrontendResources is an in-memory Filesystem with all go:embedded frontend resources.
	// The index.html is expected to be at the root of the filesystem. This prop will only be accessed
	// if the config property serveFrontend is set to true.
	FrontendResources fs.FS

	// License is the license information for Console that will be used for logging
	// and visibility purposes inside the open source version. License protected features
	// are not checked with this license.
	License license.License

	// Hooks to add additional functionality from the outside at different places
	Hooks *Hooks

	// PrometheusRegistry is the registry used for metrics registration
	PrometheusRegistry prometheus.Registerer

	// internal server instance
	server *rest.Server
}

// New creates a new API instance
func New(cfg *config.Config, inputOpts ...Option) (*API, error) {
	// Set default options and then apply all the provided options that will
	// override these defaults.
	opts := &options{
		// Default cache namespace function for single-tenant deployments.
		cacheNamespaceFn: func(_ context.Context) (string, error) {
			return "single/", nil
		},
		prometheusRegistry: prometheus.NewRegistry(),
	}
	for _, opt := range inputOpts {
		opt.apply(opts)
	}

	// Register default Go runtime and process collectors to maintain same metrics as DefaultRegisterer
	opts.prometheusRegistry.MustRegister(collectors.NewGoCollector())
	opts.prometheusRegistry.MustRegister(collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))

	var logger *slog.Logger
	if opts.logger != nil {
		// Enterprise provided a custom logger
		logger = opts.logger
	} else {
		// Create default logger from config
		logger = loggerpkg.NewSlogLogger(
			loggerpkg.WithLevel(cfg.Logger.SlogLevel),
			loggerpkg.WithFormat(loggerpkg.FormatJSON),
			loggerpkg.WithPrometheusRegistry(opts.prometheusRegistry, cfg.MetricsNamespace),
		)
	}
	slog.SetDefault(logger)

	logger.Info("started Redpanda Console",
		slog.String("version", version.Version),
		slog.String("built_at", version.BuiltAt))

	// Create default client factories if none are provided
	if err := setDefaultClientProviders(cfg, logger, opts); err != nil {
		return nil, fmt.Errorf("set default client providers: %w", err)
	}

	// Use default frontend resources from embeds. We don't use hooks here because
	// we may want to use the API struct without providing all hooks.
	if opts.frontendResources == nil {
		fsys, err := fs.Sub(embed.FrontendFiles, "frontend")
		if err != nil {
			return nil, fmt.Errorf("failed to build subtree from embedded frontend files: %w", err)
		}
		opts.frontendResources = fsys
	}

	connectSvc, err := connect.NewService(cfg.KafkaConnect, logger)
	if err != nil {
		return nil, fmt.Errorf("failed to create Kafka connect service: %w", err)
	}

	consoleSvc, err := console.NewService(
		cfg,
		logger,
		opts.kafkaClientProvider,
		opts.schemaClientProvider,
		opts.redpandaClientProvider,
		opts.cacheNamespaceFn,
		connectSvc,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create console service: %w", err)
	}

	year := 24 * time.Hour * 365
	return &API{
		Cfg:                    cfg,
		Logger:                 logger,
		ConsoleSvc:             consoleSvc,
		ConnectSvc:             connectSvc,
		KafkaClientProvider:    opts.kafkaClientProvider,
		SchemaClientProvider:   opts.schemaClientProvider,
		RedpandaClientProvider: opts.redpandaClientProvider,
		Hooks:                  newDefaultHooks(),
		FrontendResources:      opts.frontendResources,
		PrometheusRegistry:     opts.prometheusRegistry,
		License: license.License{
			Source:    license.SourceConsole,
			Type:      license.TypeOpenSource,
			ExpiresAt: time.Now().Add(year * 10).Unix(),
		},
	}, nil
}

// Set default client providers if none provided
func setDefaultClientProviders(cfg *config.Config, logger *slog.Logger, opts *options) error {
	if opts.kafkaClientProvider == nil {
		opts.kafkaClientProvider = kafkafactory.NewCachedClientProvider(cfg, logger)
	}

	// We can always create a factory if we don't already have one.
	// If the respective API is not configured, a special client provider will
	// be returned. If we attempt to retrieve a client from that factory
	// it will return a NotConfigured connect.Error.

	if opts.schemaClientProvider == nil {
		schemaClientProvider, err := schemafactory.NewSingleClientProvider(cfg)
		if err != nil {
			return fmt.Errorf("failed to create the schema registry client provider: %w", err)
		}
		opts.schemaClientProvider = schemaClientProvider
	}

	if opts.redpandaClientProvider == nil {
		redpandaClientProvider, err := redpandafactory.NewSingleClientProvider(cfg, loggerpkg.Named(logger, "admin-api"))
		if err != nil {
			return fmt.Errorf("failed to create the Redpanda client provider: %w", err)
		}
		opts.redpandaClientProvider = redpandaClientProvider
	}
	return nil
}

// Start the API server
func (api *API) Start(ctx context.Context) error {
	if err := api.ConsoleSvc.Start(ctx); err != nil {
		return fmt.Errorf("start console service: %w", err)
	}

	mux := api.routes()
	srv, err := rest.NewServer(&api.Cfg.REST.Config, api.Logger, mux)
	if err != nil {
		return fmt.Errorf("new HTTP server: %w", err)
	}
	api.server = srv

	// need this to make gRPC protocol work
	api.server.Server.Handler = h2c.NewHandler(mux, &http2.Server{})

	if err := api.server.Start(); err != nil {
		// Don't treat a graceful shutdown as an error.
		if !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("HTTP server: %w", err)
		}
	}
	return nil
}

// Stop gracefully stops the API.
func (api *API) Stop(ctx context.Context) error {
	if api.server == nil {
		return nil // idempotent
	}
	if err := api.server.Server.Shutdown(ctx); err != nil {
		return fmt.Errorf("shutdown HTTP server: %w", err)
	}
	api.ConsoleSvc.Stop()
	return nil
}
