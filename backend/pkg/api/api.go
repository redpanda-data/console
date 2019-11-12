package api

import (
	"os"
	"time"

	health "github.com/AppsFlyer/go-sundheit"
	"github.com/Shopify/sarama"
	"github.com/kafka-owl/kafka-owl/pkg/common/logging"
	"github.com/kafka-owl/kafka-owl/pkg/common/rest"
	"github.com/kafka-owl/kafka-owl/pkg/kafka"
	"github.com/prometheus/common/log"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// API represents the server and all it's dependencies to serve incoming user requests
type API struct {
	cfg *Config

	Logger   *zap.Logger
	KafkaSvc *kafka.Service
	Version  string

	restHelper *rest.Helper
	health     health.Health

	hooks *Hooks

	ExtendedFeatures bool // enable cluster select, user display, logout button, etc.
}

// New creates a new API instance
func New(cfg *Config) *API {
	logger := logging.NewLogger(&cfg.Logger, cfg.MetricsNamespace)

	// Create separate logger for sarama
	saramaLogger, err := zap.NewStdLogAt(logger.With(zap.String("source", "sarama")), zapcore.DebugLevel)
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
		logger.Fatal("Failed to create kafka client", zap.Error(err))
	}
	logger.Info("Connected to kafka")

	return &API{
		cfg:              cfg,
		Logger:           logger,
		restHelper:       &rest.Helper{Logger: logger},
		KafkaSvc:         &kafka.Service{Client: client, Logger: logger},
		Version:          os.Getenv("VERSION"),
		hooks:            newEmptyHooks(),
		ExtendedFeatures: len(os.Getenv("EXTENDED_FEATURES")) > 0,
	}
}

// Start the API server and block
func (api *API) Start() {
	api.KafkaSvc.RegisterMetrics()
	api.KafkaSvc.Start()

	// Start automatic health checks that will be reported on our '/health' route
	// TODO: we should wait until the connection to all brokers is established
	api.health = health.New()
	api.health.WithLogger(newZapShim(api.Logger.With(zap.String("source", "health"))))

	api.health.RegisterCheck(&health.Config{
		Check: &KafkaHealthCheck{
			kafkaService: api.KafkaSvc,
		},
		InitialDelay:    3 * time.Second,
		ExecutionPeriod: 25 * time.Second,
	})

	// Server
	server := rest.NewServer(&api.cfg.REST, api.Logger, api.routes())
	err := server.Start()
	if err != nil {
		api.Logger.Fatal("REST Server returned an error", zap.Error(err))
	}
}
