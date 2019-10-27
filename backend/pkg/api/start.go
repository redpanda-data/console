package api

import (
	"flag"
	"os"

	"github.com/Shopify/sarama"
	"github.com/kafka-owl/kafka-owl/pkg/common/flagext"
	"github.com/kafka-owl/kafka-owl/pkg/common/logging"
	"github.com/kafka-owl/kafka-owl/pkg/common/rest"
	"github.com/kafka-owl/kafka-owl/pkg/kafka"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var (
	commitSha string
	version   string
)

type apiBuilder struct {
	cfg    *Config
	logger *zap.Logger

	kafkaService *kafka.Service
	api          *API
	hooks        *apiHooks
}

// NewAPIBuilder builds an 'API' instance from the commandline arguments, and allows further customization
func NewAPIBuilder() *apiBuilder {
	if commitSha == "" {
		if commitSha = os.Getenv("COMMIT_SHA"); commitSha == "" {
			commitSha = "DEV"
		}
		version = os.Getenv("GITHUB_REF") // ignore empty
	}

	//
	// Load Config
	cfg := &Config{}
	flagext.RegisterFlags(cfg)
	flag.Parse()

	builder := &apiBuilder{cfg: cfg, hooks: newEmptyHooks()}

	//
	// Setup Logger
	builder.logger = logging.NewLogger(&cfg.Logger, cfg.MetricsNamespace)

	//
	// Setup KafkaService
	builder.setupKafkaService()

	return builder
}

func (b *apiBuilder) setupKafkaService() {

	log := b.logger
	cfg := b.cfg

	//
	// Create separate logger for sarama
	saramaLogger, err := zap.NewStdLogAt(log.With(zap.String("source", "sarama")), zapcore.DebugLevel)
	if err != nil {
		log.Fatal("failed to create std logger for sarama", zap.Error(err))
	}
	sarama.Logger = saramaLogger

	//
	// Sarama Config
	saramaConfig, err := kafka.NewSaramaConfig(&cfg.Kafka)
	if err != nil {
		log.Fatal("Failed to create a valid sarama config", zap.Error(err))
	}

	//
	// Sarama Client
	client, err := sarama.NewClient(cfg.Kafka.Brokers, saramaConfig)
	if err != nil {
		log.Fatal("Failed to create kafka client", zap.Error(err))
	}
	log.Info("Successfully connected to kafka", zap.Strings("kafka_brokers", cfg.Kafka.Brokers))

	//
	// Kafka Service
	b.kafkaService = &kafka.Service{
		Client: client,
		Logger: log,
	}
}

// WithHooks sets api hooks
func (b *apiBuilder) WithHooks(hooks *apiHooks) *apiBuilder {
	b.hooks = hooks
	return b
}

// Finalize the builder
func (b *apiBuilder) Build() *API {
	return &API{
		cfg:        b.cfg,
		logger:     b.logger,
		restHelper: &rest.Helper{Logger: b.logger},
		kafkaSvc:   b.kafkaService,
		hooks:      b.hooks,
	}
}
