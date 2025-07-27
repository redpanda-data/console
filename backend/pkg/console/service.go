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
	"log/slog"
	"time"

	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
	"github.com/twmb/franz-go/pkg/kversion"

	"github.com/redpanda-data/console/backend/pkg/backoff"
	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/connect"
	kafkafactory "github.com/redpanda-data/console/backend/pkg/factory/kafka"
	redpandafactory "github.com/redpanda-data/console/backend/pkg/factory/redpanda"
	schemafactory "github.com/redpanda-data/console/backend/pkg/factory/schema"
	"github.com/redpanda-data/console/backend/pkg/git"
	loggerpkg "github.com/redpanda-data/console/backend/pkg/logger"
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
	cachedSchemaClient    schemacache.Client
	serdeSvc              *serde.Service
	protoSvc              *proto.Service
	logger                *slog.Logger
	cfg                   *config.Config

	// configExtensionsByName contains additional metadata about Topic or BrokerWithLogDirs configs.
	// The additional information is used by the frontend to provide a good UX when
	// editing configs or creating new topics.
	configExtensionsByName map[string]ConfigEntryExtension
}

// NewService for the Console package
func NewService(
	cfg *config.Config,
	logger *slog.Logger,
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
	if cfg.Serde.Protobuf.Enabled {
		protoSvc, err = proto.NewService(cfg.Serde.Protobuf, loggerpkg.Named(logger, "proto_service"))
		if err != nil {
			return nil, fmt.Errorf("failed to create protobuf service: %w", err)
		}
	}

	var msgPackSvc *msgpack.Service
	if cfg.Serde.MessagePack.Enabled {
		msgPackSvc, err = msgpack.NewService(cfg.Serde.MessagePack)
		if err != nil {
			return nil, fmt.Errorf("failed to create msgpack service: %w", err)
		}
	}

	var cachedSchemaClient schemacache.Client
	if cfg.SchemaRegistry.Enabled {
		cachedSchemaClient, err = schemacache.NewCachedClient(schemaClientFactory, cacheNamespaceFn)
		if err != nil {
			return nil, fmt.Errorf("failed to create schema client: %w", err)
		}
	}
	serdeSvc, err := serde.NewService(protoSvc, msgPackSvc, cachedSchemaClient, cfg.Serde.Cbor)
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
		protoSvc:              protoSvc,
		logger:                logger,
		cfg:                   cfg,

		configExtensionsByName: configExtensionsByName,
	}, nil
}

// Start starts all the (background) tasks which are required for this service to work properly. If any of these
// tasks can not be setup an error will be returned which will cause the application to exit.
func (s *Service) Start(ctx context.Context) error {
	if s.gitSvc != nil {
		err := s.gitSvc.Start()
		if err != nil {
			return fmt.Errorf("failed to start git service: %w", err)
		}
	}
	if s.protoSvc != nil {
		err := s.protoSvc.Start()
		if err != nil {
			return fmt.Errorf("failed to start proto service: %w", err)
		}
	}

	if err := s.testKafkaConnectivity(ctx); err != nil {
		return fmt.Errorf("failed to test kafka connectivity: %w", err)
	}

	return nil
}

// Stop stops running go routines and releases allocated resources.
func (*Service) Stop() {
	// Nothing to stop, the gitSvc listens for OS signals itself and stops its goroutines then.
}

func (s *Service) testKafkaConnectivity(ctx context.Context) error {
	shouldTest := s.cfg.Kafka.Startup.EstablishConnectionEagerly
	canTest := !s.cfg.Kafka.SASL.ImpersonateUser

	if !shouldTest || !canTest {
		return nil
	}

	testConnection := func(kafkaCl *kgo.Client, timeout time.Duration) error {
		connectionCtx, cancel := context.WithTimeout(ctx, timeout)
		defer cancel()

		s.logger.InfoContext(connectionCtx, "connecting to Kafka seed brokers, trying to fetch cluster metadata", slog.Any("seed_brokers", s.cfg.Kafka.Brokers))
		req := kmsg.NewMetadataRequest()
		res, err := req.RequestWith(connectionCtx, kafkaCl)
		if err != nil {
			return fmt.Errorf("failed to request metadata: %w", err)
		}

		// Request versions in order to guess Kafka Cluster version
		versionsReq := kmsg.NewApiVersionsRequest()
		versionsRes, err := versionsReq.RequestWith(connectionCtx, kafkaCl)
		if err != nil {
			return fmt.Errorf("failed to request api versions: %w", err)
		}
		err = kerr.ErrorForCode(versionsRes.ErrorCode)
		if err != nil {
			return fmt.Errorf("failed to request api versions. Inner kafka error: %w", err)
		}
		versions := kversion.FromApiVersionsResponse(versionsRes)

		s.logger.InfoContext(connectionCtx, "successfully connected to kafka cluster",
			slog.Int("advertised_broker_count", len(res.Brokers)),
			slog.Int("topic_count", len(res.Topics)),
			slog.Int("controller_id", int(res.ControllerID)),
			slog.String("kafka_version", versions.VersionGuess()))

		return nil
	}

	// Ensure Kafka connection works, otherwise fail fast. Allow up to 5 retries with exponentially increasing backoff.
	// Retries with backoff is very helpful in environments where Console concurrently starts with the Kafka target,
	// such as a docker-compose demo.
	eb := backoff.ExponentialBackoff{
		BaseInterval: s.cfg.Kafka.Startup.RetryInterval,
		MaxInterval:  s.cfg.Kafka.Startup.MaxRetryInterval,
		Multiplier:   s.cfg.Kafka.Startup.BackoffMultiplier,
	}
	attempt := 0

	kafkaCl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return err
	}

	for attempt < s.cfg.Kafka.Startup.MaxRetries && s.cfg.Kafka.Startup.EstablishConnectionEagerly {
		err = testConnection(kafkaCl, time.Second*15)
		if err == nil {
			break
		}

		backoffDuration := eb.Backoff(attempt)
		s.logger.WarnContext(ctx,
			fmt.Sprintf("failed to test Kafka connection, going to retry in %s", backoffDuration),
			slog.Int("remaining_retries", s.cfg.Kafka.Startup.MaxRetries-attempt),
		)
		attempt++
		time.Sleep(backoffDuration)
	}
	if err != nil {
		return fmt.Errorf("failed to test kafka connection: %w", err)
	}

	return nil
}
