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
	"fmt"
	"io/fs"
	"time"

	"github.com/cloudhut/common/rest"
	"go.uber.org/zap"
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
	"github.com/redpanda-data/console/backend/pkg/logging"
	"github.com/redpanda-data/console/backend/pkg/version"
)

// API represents the server and all it's dependencies to serve incoming user requests
type API struct {
	Cfg *config.Config

	Logger     *zap.Logger
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

	// internal server intance
	server *rest.Server
}

// New creates a new API instance
func New(cfg *config.Config, inputOpts ...Option) *API {
	// Set default options and then apply all the provided options that will
	// override these defaults.
	opts := &options{
		// Default cache namespace function for single-tenant deployments.
		cacheNamespaceFn: func(_ context.Context) (string, error) {
			return "single/", nil
		},
	}
	for _, opt := range inputOpts {
		opt.apply(opts)
	}

	// We don't initialize the logger for the default options to avoid
	// duplicate initialization of the logger with all its metrics.
	var logger *zap.Logger
	if opts.logger == nil {
		logger = logging.NewLogger(&cfg.Logger, cfg.MetricsNamespace)
	} else {
		logger = opts.logger
	}

	logger.Info("started Redpanda Console",
		zap.String("version", version.Version),
		zap.String("built_at", version.BuiltAt))

	// Create default client factories if none are provided
	setDefaultClientProviders(cfg, logger, opts)

	// Use default frontend resources from embeds. We don't use hooks here because
	// we may want to use the API struct without providing all hooks.
	if opts.frontendResources == nil {
		fsys, err := fs.Sub(embed.FrontendFiles, "frontend")
		if err != nil {
			logger.Fatal("failed to build subtree from embedded frontend files", zap.Error(err))
		}
		opts.frontendResources = fsys
	}

	connectSvc, err := connect.NewService(cfg.KafkaConnect, logger)
	if err != nil {
		logger.Fatal("failed to create Kafka connect service", zap.Error(err))
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
		logger.Fatal("failed to create console service", zap.Error(err))
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
		License: license.License{
			Source:    license.SourceConsole,
			Type:      license.TypeOpenSource,
			ExpiresAt: time.Now().Add(year * 10).Unix(),
		},
	}
}

// Set default client providers if none provided
func setDefaultClientProviders(cfg *config.Config, logger *zap.Logger, opts *options) {
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
			logger.Fatal("failed to create the schema registry client provider", zap.Error(err))
		}
		opts.schemaClientProvider = schemaClientProvider
	}

	if opts.redpandaClientProvider == nil {
		redpandaClientProvider, err := redpandafactory.NewSingleClientProvider(cfg, logger.Named("admin-api"))
		if err != nil {
			logger.Fatal("failed to create the Redpanda client provider", zap.Error(err))
		}
		opts.redpandaClientProvider = redpandaClientProvider
	}
}

// Start the API server and block
func (api *API) Start() {
	// Assume 6s for other initializations and up to max startup time before we cancel
	// the context and force to return early.
	maxStartTime := 6*time.Second + api.Cfg.Kafka.Startup.TotalMaxTime()
	startCtx, cancel := context.WithTimeout(context.Background(), maxStartTime)
	defer cancel()

	err := api.ConsoleSvc.Start(startCtx)
	if err != nil {
		api.Logger.Fatal("failed to start console service", zap.Error(err))
	}

	mux := api.routes()

	// Server
	api.server, err = rest.NewServer(&api.Cfg.REST.Config, api.Logger, mux)
	if err != nil {
		api.Logger.Fatal("failed to create HTTP server", zap.Error(err))
	}

	// need this to make gRPC protocol work
	api.server.Server.Handler = h2c.NewHandler(mux, &http2.Server{})

	err = api.server.Start()
	if err != nil {
		api.Logger.Fatal("REST Server returned an error", zap.Error(err))
	}
}

// Stop gracefully stops the API.
func (api *API) Stop(ctx context.Context) error {
	err := api.server.Server.Shutdown(ctx)
	if err != nil {
		return fmt.Errorf("failed to shutdown HTTP server: %w", err)
	}
	return nil
}
