package kafka

import (
	"context"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/schema"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap/zapcore"
	"time"

	"github.com/Shopify/sarama"
	"go.uber.org/zap"
	"golang.org/x/time/rate"
)

// Service acts as interface to interact with the Kafka Cluster
type Service struct {
	Logger           *zap.Logger
	KafkaClient      *kgo.Client
	Client           sarama.Client
	AdminClient      sarama.ClusterAdmin
	SchemaService    *schema.Service
	Deserializer     deserializer
	MetricsNamespace string
}

// NewService creates a new Kafka service and immediately checks connectivity to all components. If any of these external
// dependencies fail an error wil be returned.
func NewService(cfg Config, logger *zap.Logger, metricsNamespace string) (*Service, error) {
	// Create separate logger for sarama
	saramaLogger, err := zap.NewStdLogAt(logger.With(zap.String("source", "sarama")), zapcore.DebugLevel)
	if err != nil {
		return nil, fmt.Errorf("failed to create std logger for sarama: %w", err)
	}
	sarama.Logger = saramaLogger

	// Sarama Config
	saramaConfig, err := NewSaramaConfig(&cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create a valid sarama config: %w", err)
	}

	// Sarama Client
	logger.Info("connecting to Kafka cluster")
	client, err := sarama.NewClient(cfg.Brokers, saramaConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create kafka client: %w", err)
	}
	logger.Info("connected to at least one Kafka broker")

	// Kafka client
	kgoOpts, err := NewKgoConfig(&cfg)
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

	// Sarama Admin Client
	adminClient, err := sarama.NewClusterAdminFromClient(client)
	if err != nil {
		return nil, fmt.Errorf("failed to create kafka admin client: %w", err)
	}

	// Schema Registry
	var schemaSvc *schema.Service
	if cfg.Schema.Enabled {
		logger.Info("connecting to schema registry")
		schemaSvc, err = schema.NewSevice(cfg.Schema)
		if err != nil {
			return nil, fmt.Errorf("failed to create schema service: %w", err)
		}

		err := schemaSvc.CheckConnectivity()
		if err != nil {
			return nil, fmt.Errorf("failed to verify connectivity to schema registry: %w", err)
		}
	}

	return &Service{
		Logger:           logger,
		KafkaClient:      kafkaClient,
		Client:           client,
		AdminClient:      adminClient,
		SchemaService:    schemaSvc,
		Deserializer:     deserializer{SchemaService: schemaSvc},
		MetricsNamespace: metricsNamespace,
	}, nil
}

// Start initializes the Kafka Service and takes care of stuff like KeepAlive
func (s *Service) Start() {

	// Immediately start connecting to all brokers
	brokers := s.Client.Brokers()
	for _, broker := range brokers {
		broker.Open(s.Client.Config())
	}

	// Custom keep alive for Kafka, because: https://github.com/Shopify/sarama/issues/1487
	// The KeepAlive property in sarama doesn't work either, because of golang's buggy net module: https://github.com/golang/go/issues/31490
	go s.keepAlive()
}

// testConnection tries to fetch Broker metadata and prints some information if connection succeeds. An error will be
// returned if connecting fails.
func testConnection(logger *zap.Logger, client *kgo.Client, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	req := kmsg.MetadataRequest{
		Topics: []kmsg.MetadataRequestTopic{},
	}
	res, err := req.RequestWith(ctx, client)
	if err != nil {
		return fmt.Errorf("failed to request metadata: %w", err)
	}

	logger.Info("successfully connected to kafka cluster",
		zap.Int("advertised_broker_count", len(res.Brokers)),
		zap.Int("topics_count", len(res.Topics)),
		zap.Int32("controller_id", res.ControllerID))

	return nil
}

func (s *Service) keepAlive() {
	log := s.Logger
	wasHealthy := false
	warningLimit := rate.NewLimiter(rate.Every(30*time.Second), 1)
	for {
		// Normal keepalive interval is 3 seconds
		time.Sleep(3 * time.Second)

		brokers := s.Client.Brokers()
		connectedCount := 0

		for _, broker := range brokers {
			connected, _ := broker.Connected()
			if !connected {
				// Not connected
				err := broker.Open(s.Client.Config())
				if err != nil && err != sarama.ErrAlreadyConnected {
					// Bad address?
					log.Warn("could not open connection to broker", zap.String("broker", broker.Addr()), zap.Error(err))
				} else {
					log.Info("connecting to broker", zap.String("broker", broker.Addr()))
				}
				continue
			}

			// Verify existing connection
			_, err := broker.GetMetadata(&sarama.MetadataRequest{})
			if err != nil {
				log.Warn("heartbeat: lost connection to broker", zap.Error(err), zap.String("broker", broker.Addr()), zap.Int32("id", broker.ID()))
				_ = broker.Close()
				_ = broker.Open(s.Client.Config())

				log.Info("trying to refresh cluster metadata after we've lost connection to at least one broker")
				metadataErr := s.Client.RefreshMetadata()
				if metadataErr == nil {
					log.Info("refreshed cluster metadata successfully")
				} else {
					log.Warn("failed to refresh cluster metadata after we've lost connection to at least one broker")
				}
				continue
			}

			// Broker connection is healthy
			connectedCount++
		}

		if connectedCount == len(brokers) {
			if !wasHealthy {
				log.Info("connection to all brokers healthy", zap.Int("brokers", connectedCount))
			}
			wasHealthy = true
		} else {
			if warningLimit.Allow() {
				log.Info("not connected to all brokers", zap.Int("connected", connectedCount), zap.Int("brokers", len(brokers)))
			}
			wasHealthy = false
		}
	}
}
