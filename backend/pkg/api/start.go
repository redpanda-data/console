package api

import (
	"os"

	"github.com/Shopify/sarama"
	"github.com/kafka-owl/kafka-owl/pkg/common/logging"
	"github.com/kafka-owl/kafka-owl/pkg/common/rest"
	"github.com/kafka-owl/kafka-owl/pkg/kafka"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var (
	// version shown at the bottom of the sidebar
	version          string
)

// APIBuilder contains references/objects needed to create an api instance
type APIBuilder struct {
	cfg    *Config
	Logger *zap.Logger

	kafkaService *kafka.Service
	api          *API
	Hooks        *Hooks
	ExtendedFeatures bool
}

// NewAPIBuilder builds an 'API' instance from the commandline arguments, and allows further customization
func NewAPIBuilder(cfg *Config) *APIBuilder {

	version = os.Getenv("VERSION")
	builder := &APIBuilder{
		cfg:   cfg,
		Hooks: newEmptyHooks(),
		ExtendedFeatures: len(os.Getenv("EXTENDED_FEATURES")) > 0,
	}
	builder.Logger = logging.NewLogger(&cfg.Logger, cfg.MetricsNamespace)
	builder.setupKafkaService()

	return builder
}

func (b *APIBuilder) setupKafkaService() {
	log := b.Logger
	cfg := b.cfg

	// Create separate logger for sarama
	saramaLogger, err := zap.NewStdLogAt(log.With(zap.String("source", "sarama")), zapcore.DebugLevel)
	if err != nil {
		log.Fatal("failed to create std logger for sarama", zap.Error(err))
	}
	sarama.Logger = saramaLogger

	// Sarama Config
	saramaConfig, err := kafka.NewSaramaConfig(&cfg.Kafka)
	if err != nil {
		log.Fatal("Failed to create a valid sarama config", zap.Error(err))
	}

	// Sarama Client
	client, err := sarama.NewClient(cfg.Kafka.Brokers, saramaConfig)
	if err != nil {
		log.Fatal("Failed to create kafka client", zap.Error(err))
	}
	log.Info("Connected to kafka")

	// Kafka Service
	b.kafkaService = &kafka.Service{
		Client: client,
		Logger: log,
	}
}

// Build finalizes the builder and creates the API object
func (b *APIBuilder) Build() *API {

	b.Logger.Info("environment variables", zap.String("version", version), zap.Bool("extendedFeatures", b.ExtendedFeatures))

	return &API{
		cfg:        b.cfg,
		Logger:     b.Logger,
		restHelper: &rest.Helper{Logger: b.Logger},
		KafkaSvc:   b.kafkaService,
		hooks:      b.Hooks,
		ExtendedFeatures: b.ExtendedFeatures,
	}
}
