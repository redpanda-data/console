// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"time"

	"github.com/cloudhut/common/logging"
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/connect"
	"github.com/cloudhut/kowl/backend/pkg/console"
	"github.com/cloudhut/kowl/backend/pkg/git"
	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"github.com/cloudhut/kowl/backend/pkg/version"
	"go.uber.org/zap"
)

// API represents the server and all it's dependencies to serve incoming user requests
type API struct {
	Cfg *Config

	Logger     *zap.Logger
	KafkaSvc   *kafka.Service
	ConsoleSvc *console.Service
	ConnectSvc *connect.Service
	GitSvc     *git.Service

	Hooks *Hooks // Hooks to add additional functionality from the outside at different places (used by Kafka Console Business)
}

// New creates a new API instance
func New(cfg *Config) *API {
	logger := logging.NewLogger(&cfg.Logger, cfg.MetricsNamespace)

	logger.Info("started Redpanda Console",
		zap.String("version", version.Version),
		zap.String("built_at", version.BuiltAt.Format(time.RFC3339)))

	kafkaSvc, err := kafka.NewService(cfg.Kafka, logger, cfg.MetricsNamespace)
	if err != nil {
		logger.Fatal("failed to create kafka service", zap.Error(err))
	}

	consoleSvc, err := console.NewService(cfg.Console, logger, kafkaSvc)
	if err != nil {
		logger.Fatal("failed to create owl service", zap.Error(err))
	}

	connectSvc, err := connect.NewService(cfg.Connect, logger)
	if err != nil {
		logger.Fatal("failed to create Kafka connect service", zap.Error(err))
	}

	return &API{
		Cfg:        cfg,
		Logger:     logger,
		KafkaSvc:   kafkaSvc,
		ConsoleSvc: consoleSvc,
		ConnectSvc: connectSvc,
		Hooks:      newDefaultHooks(),
	}
}

// Start the API server and block
func (api *API) Start() {
	err := api.KafkaSvc.Start()
	if err != nil {
		api.Logger.Fatal("failed to start kafka service", zap.Error(err))
	}

	err = api.ConsoleSvc.Start()
	if err != nil {
		api.Logger.Fatal("failed to start console service", zap.Error(err))
	}

	// Server
	server := rest.NewServer(&api.Cfg.REST, api.Logger, api.routes())
	err = server.Start()
	if err != nil {
		api.Logger.Fatal("REST Server returned an error", zap.Error(err))
	}
}
