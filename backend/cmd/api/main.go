package main

import (
	"flag"
	"os"
	"time"

	health "github.com/AppsFlyer/go-sundheit"
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
)

func main() {

	//
	// 1. Config
	var cfg Config
	flagext.RegisterFlags(&cfg)
	flag.Parse()

	if commitSha = os.Getenv("COMMIT_SHA"); commitSha == "" {
		commitSha = "DEV"
	}

	//
	// 2. Logger
	logger := logging.NewLogger(&cfg.Logger, cfg.MetricsNamespace)
	restHelper := &rest.Helper{Logger: logger}

	//
	// 3. Sarama, KafkaService
	logger.Info("Creating kafka clients", zap.Strings("kafka_brokers", cfg.Kafka.Brokers))

	// - logger
	saramaLogger, err := zap.NewStdLogAt(logger.With(zap.String("source", "sarama")), zapcore.DebugLevel)
	if err != nil {
		logger.Fatal("failed to create std logger for sarama", zap.Error(err))
	}
	sarama.Logger = saramaLogger

	// - config
	sCfg, err := kafka.NewSaramaConfig(&cfg.Kafka)
	if err != nil {
		logger.Fatal("Failed to create a valid sarama config", zap.Error(err))
	}

	// - client
	client, err := sarama.NewClient(cfg.Kafka.Brokers, sCfg)
	if err != nil {
		logger.Fatal("Failed to create kafka client", zap.Error(err))
	}
	logger.Info("Successfully connected to kafka", zap.Strings("kafka_brokers", cfg.Kafka.Brokers))

	// - service
	kafkaService := &kafka.Service{
		Client: client,
		Logger: logger,
	}

	//
	// 4. Health check
	h := health.New()
	h.WithLogger(newZapShim(logger.With(zap.String("source", "health"))))
	check := &KafkaHealthCheck{kafkaService: kafkaService}
	h.RegisterCheck(&health.Config{
		Check:           check,
		InitialDelay:    3 * time.Second,
		ExecutionPeriod: 25 * time.Second,
	})

	api := &API{
		cfg:        &cfg,
		logger:     logger,
		restHelper: restHelper,
		kafkaSvc:   kafkaService,
		health:     h,
	}
	api.Start()
}
