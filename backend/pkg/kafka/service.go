package kafka

import (
	"context"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/git"
	"github.com/cloudhut/kowl/backend/pkg/schema"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
	"time"

	"go.uber.org/zap"
)

// Service acts as interface to interact with the Kafka Cluster
type Service struct {
	Config Config
	Logger *zap.Logger

	KafkaClientHooks kgo.Hook
	KafkaClient      *kgo.Client
	SchemaService    *schema.Service
	GitService       *git.Service
	Deserializer     deserializer
	MetricsNamespace string
}

// NewService creates a new Kafka service and immediately checks connectivity to all components. If any of these external
// dependencies fail an error wil be returned.
func NewService(cfg Config, logger *zap.Logger, metricsNamespace string) (*Service, error) {
	// Kafka client
	hooksChildLogger := logger.With(zap.String("source", "kafka_client_hooks"))
	clientHooks := newClientHooks(hooksChildLogger, "kowl")

	kgoOpts, err := NewKgoConfig(&cfg, logger, clientHooks)
	if err != nil {
		return nil, fmt.Errorf("failed to create a valid kafka client config: %w", err)
	}

	kafkaClient, err := kgo.NewClient(kgoOpts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create kafka client: %w", err)
	}
	err = testConnection(logger, kafkaClient, time.Second*15)
	if err != nil {
		return nil, fmt.Errorf("failed to test kafka connection: %w", err)
	}

	// Schema Registry
	var schemaSvc *schema.Service
	if cfg.Schema.Enabled {
		logger.Info("creating schema registry client and testing connectivity")
		schemaSvc, err = schema.NewSevice(cfg.Schema)
		if err != nil {
			return nil, fmt.Errorf("failed to create schema service: %w", err)
		}

		err := schemaSvc.CheckConnectivity()
		if err != nil {
			return nil, fmt.Errorf("failed to verify connectivity to schema registry: %w", err)
		}
		logger.Info("successfully tested schema registry connectivity")
	}

	// Git Service
	var gitSvc *git.Service
	if cfg.Protobuf.Enabled && cfg.Protobuf.Git.Enabled {
		svc, err := git.NewService(cfg.Protobuf.Git, logger)
		if err != nil {
			return nil, fmt.Errorf("failed to create git service: %w", err)
		}
		gitSvc = svc
	}

	return &Service{
		Config:           cfg,
		Logger:           logger,
		KafkaClientHooks: clientHooks,
		KafkaClient:      kafkaClient,
		SchemaService:    schemaSvc,
		GitService:       gitSvc,
		Deserializer:     deserializer{SchemaService: schemaSvc},
		MetricsNamespace: metricsNamespace,
	}, nil
}

func (s *Service) NewKgoClient() (*kgo.Client, error) {
	// Kafka client
	kgoOpts, err := NewKgoConfig(&s.Config, s.Logger, s.KafkaClientHooks)
	if err != nil {
		return nil, fmt.Errorf("failed to create a valid kafka client config: %w", err)
	}

	kafkaClient, err := kgo.NewClient(kgoOpts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create kafka client: %w", err)
	}

	return kafkaClient, nil
}

// testConnection tries to fetch Broker metadata and prints some information if connection succeeds. An error will be
// returned if connecting fails.
func testConnection(logger *zap.Logger, client *kgo.Client, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	logger.Info("connecting to Kafka seed brokers, trying to fetch cluster metadata")

	req := kmsg.MetadataRequest{
		Topics: nil,
	}
	res, err := req.RequestWith(ctx, client)
	if err != nil {
		return fmt.Errorf("failed to request metadata: %w", err)
	}

	logger.Info("successfully connected to kafka cluster",
		zap.Int("advertised_broker_count", len(res.Brokers)),
		zap.Int("topic_count", len(res.Topics)),
		zap.Int32("controller_id", res.ControllerID))

	return nil
}
