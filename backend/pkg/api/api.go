package api

import (
	"os"
	"time"

	"golang.org/x/time/rate"

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

	// Custom keep alive for Kafka, because: https://github.com/Shopify/sarama/issues/1487
	// The KeepAlive property in sarama doesn't work either, because of golang's buggy net module: https://github.com/golang/go/issues/31490
	// todo: this should definitely be in its own file (and also in /pkg/kafka/)
	go func() {
		log := api.Logger
		wasHealthy := false
		warningLimit := rate.NewLimiter(rate.Every(30*time.Second), 1)
		for {
			// Normal keepalive interval is 3 seconds
			time.Sleep(3 * time.Second)

			brokers := api.KafkaSvc.Client.Brokers()
			//log.Info("Kafka Keepalive", zap.Int("brokers", len(brokers)))
			connectedCount := 0

			for _, b := range brokers {

				connected, _ := b.Connected()
				if !connected {
					err := b.Open(api.KafkaSvc.Client.Config())
					if err != nil {
						log.Warn("could not open connection to broker", zap.String("broker", b.Addr()), zap.Error(err))
					} else {
						log.Info("connecting to broker...", zap.String("broker", b.Addr()))
					}
					continue
				}
				connectedCount++

				_, err := b.GetMetadata(&sarama.MetadataRequest{})

				if err != nil {
					log.Warn("Heartbeat to broker has errored", zap.Error(err), zap.String("broker", b.Addr()), zap.Int32("id", b.ID()))

					b.Close()
					b.Open(api.KafkaSvc.Client.Config())
				}
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
	}()

	//
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
