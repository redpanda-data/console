package main

import (
	"flag"
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

func main() {

	var cfg Config
	flagext.RegisterFlags(&cfg)
	flag.Parse()

	// Create dependencies for all handlers
	logger := logging.NewLogger(&cfg.Logger, cfg.MetricsNamespace)
	restHelper := &rest.Helper{Logger: logger}

	// Create kafka service
	logger.Info("Creating kafka clients", zap.Strings("kafka_brokers", cfg.Kafka.Brokers))

	saramaLogger, err := zap.NewStdLogAt(logger.With(zap.String("source", "sarama")), zapcore.DebugLevel)
	if err != nil {
		logger.Fatal("failed to create std logger for sarama", zap.Error(err))
	}
	sarama.Logger = saramaLogger

	sCfg, err := kafka.NewSaramaConfig(&cfg.Kafka)
	if err != nil {
		logger.Fatal("Failed to create a valid sarama config", zap.Error(err))
	}
	client, err := sarama.NewClient(cfg.Kafka.Brokers, sCfg)
	if err != nil {
		logger.Fatal("Failed to create kafka client", zap.Error(err))
	}
	logger.Info("Successfully connected to kafka", zap.Strings("kafka_brokers", cfg.Kafka.Brokers))

	kafkaService := &kafka.Service{
		Client: client,
		Logger: logger,
	}

	// Health check
	h := health.New()
	check := &KafkaHealthCheck{kafkaService: kafkaService}
	h.RegisterCheck(&health.Config{
		Check: check,
	})

	// Custom keep alive
	go func() {
		for {
			_, err := kafkaService.ListTopics()
			if err != nil {
				logger.Warn("Keep alive has errored", zap.Error(err))
			}
			time.Sleep(30 * time.Second)
		}
	}()

	api := &API{
		cfg:        &cfg,
		logger:     logger,
		restHelper: restHelper,
		kafkaSvc:   kafkaService,
		health:     h,
	}
	api.Start()
}
