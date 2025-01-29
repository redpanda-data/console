// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"fmt"

	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/connect"
	kafkafactory "github.com/redpanda-data/console/backend/pkg/factory/kafka"
	redpandafactory "github.com/redpanda-data/console/backend/pkg/factory/redpanda"
	schemafactory "github.com/redpanda-data/console/backend/pkg/factory/schema"
	"github.com/redpanda-data/console/backend/pkg/git"
	"github.com/redpanda-data/console/backend/pkg/msgpack"
	"github.com/redpanda-data/console/backend/pkg/proto"
	schemacache "github.com/redpanda-data/console/backend/pkg/schema"
	"github.com/redpanda-data/console/backend/pkg/serde"
)

var _ Servicer = (*Service)(nil)

// Service offers all methods to serve the responses for the REST API. This usually only involves fetching
// several responses from Kafka concurrently and constructing them so, that they are
type Service struct {
	kafkaClientFactory    kafkafactory.ClientFactory
	schemaClientFactory   schemafactory.ClientFactory
	redpandaClientFactory redpandafactory.ClientFactory
	gitSvc                *git.Service // Git service can be nil if not configured
	connectSvc            *connect.Service
	cachedSchemaClient    *schemacache.CachedClient
	serdeSvc              *serde.Service
	logger                *zap.Logger
	cfg                   *config.Config

	// configExtensionsByName contains additional metadata about Topic or BrokerWithLogDirs configs.
	// The additional information is used by the frontend to provide a good UX when
	// editing configs or creating new topics.
	configExtensionsByName map[string]ConfigEntryExtension
}

// NewService for the Console package
func NewService(
	cfg *config.Config,
	logger *zap.Logger,
	kafkaClientFactory kafkafactory.ClientFactory,
	schemaClientFactory schemafactory.ClientFactory,
	redpandaClientFactory redpandafactory.ClientFactory,
	cacheNamespaceFn func(context.Context) (string, error),
	connectSvc *connect.Service,
) (Servicer, error) {
	var gitSvc *git.Service
	cfg.Console.TopicDocumentation.Git.AllowedFileExtensions = []string{"md"}
	if cfg.Console.TopicDocumentation.Enabled && cfg.Console.TopicDocumentation.Git.Enabled {
		svc, err := git.NewService(cfg.Console.TopicDocumentation.Git, logger, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to create git service: %w", err)
		}
		gitSvc = svc
	}

	configExtensionsByName, err := loadConfigExtensions()
	if err != nil {
		return nil, fmt.Errorf("failed to load config extensions: %w", err)
	}

	var protoSvc *proto.Service
	if cfg.Kafka.Protobuf.Enabled {
		protoSvc, err = proto.NewService(cfg.Kafka.Protobuf, logger.Named("proto_service"))
		if err != nil {
			return nil, fmt.Errorf("failed to create protobuf service: %w", err)
		}
	}

	var msgPackSvc *msgpack.Service
	if cfg.Kafka.MessagePack.Enabled {
		msgPackSvc, err = msgpack.NewService(cfg.Kafka.MessagePack)
		if err != nil {
			return nil, fmt.Errorf("failed to create msgpack service: %w", err)
		}
	}

	var cachedSchemaClient *schemacache.CachedClient
	if cfg.SchemaRegistry.Enabled {
		cachedSchemaClient, err = schemacache.NewCachedClient(schemaClientFactory, cacheNamespaceFn)
		if err != nil {
			return nil, fmt.Errorf("failed to create schema client: %w", err)
		}
	}
	serdeSvc, err := serde.NewService(protoSvc, msgPackSvc, cachedSchemaClient, cfg.Kafka.Cbor)
	if err != nil {
		return nil, fmt.Errorf("failed creating serde service: %w", err)
	}

	return &Service{
		kafkaClientFactory:    kafkaClientFactory,
		schemaClientFactory:   schemaClientFactory,
		redpandaClientFactory: redpandaClientFactory,
		gitSvc:                gitSvc,
		connectSvc:            connectSvc,
		cachedSchemaClient:    cachedSchemaClient,
		serdeSvc:              serdeSvc,
		logger:                logger,
		cfg:                   cfg,

		configExtensionsByName: configExtensionsByName,
	}, nil
}

// Start starts all the (background) tasks which are required for this service to work properly. If any of these
// tasks can not be setup an error will be returned which will cause the application to exit.
func (s *Service) Start() error {
	if s.gitSvc != nil {
		err := s.gitSvc.Start()
		if err != nil {
			return fmt.Errorf("failed to start git service: %w", err)
		}
	}

	return nil
}

// Stop stops running go routines and releases allocated resources.
func (*Service) Stop() {
	// Nothing to stop, the gitSvc listens for OS signals itself and stops its goroutines then.
}
