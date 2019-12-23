package api

import (
	"os"
	"time"

	health "github.com/AppsFlyer/go-sundheit"
	"github.com/Shopify/sarama"
	"github.com/kafka-owl/common/logging"
	"github.com/kafka-owl/common/rest"
	"github.com/kafka-owl/kafka-owl/pkg/kafka"
	"github.com/kafka-owl/kafka-owl/pkg/owl"
	"github.com/prometheus/common/log"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// API represents the server and all it's dependencies to serve incoming user requests
type API struct {
	Cfg *Config

	Logger   *zap.Logger
	KafkaSvc *kafka.Service
	OwlSvc   *owl.Service
	Version  string

	health     health.Health

	Hooks            *Hooks // Hooks to add additional functionality from the outside at different places (used by Kafka Owl Business)
	ExtendedFeatures bool   // enable cluster select, user display, logout button, etc.
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

	kafkaSvc := &kafka.Service{Client: client, Logger: logger}

	return &API{
		Cfg:              cfg,
		Logger:           logger,
		KafkaSvc:         kafkaSvc,
		OwlSvc:           owl.NewService(kafkaSvc, logger, &cfg.Owl),
		Version:          os.Getenv("VERSION"),
		Hooks:            newEmptyHooks(),
		ExtendedFeatures: len(os.Getenv("EXTENDED_FEATURES")) > 0,
	}
}

// Start the API server and block
func (api *API) Start() {
	api.KafkaSvc.RegisterMetrics()
	api.KafkaSvc.Start()

	// Start automatic health checks that will be reported on our '/health' route
	// TODO: Implement startup/readiness/liveness probe, might be blocked by: https://github.com/AppsFlyer/go-sundheit/issues/16
	api.health = health.New()

	api.health.RegisterCheck(&health.Config{
		Check: &KafkaHealthCheck{
			kafkaService: api.KafkaSvc,
		},
		InitialDelay:    3 * time.Second,
		ExecutionPeriod: 25 * time.Second,
	})

	// Server
	server := rest.NewServer(&api.Cfg.REST, api.Logger, api.routes())
	err := server.Start()
	if err != nil {
		api.Logger.Fatal("REST Server returned an error", zap.Error(err))
	}
}
