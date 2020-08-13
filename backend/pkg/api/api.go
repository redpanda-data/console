package api

import (
	"github.com/cloudhut/common/logging"
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"go.uber.org/zap"
)

// API represents the server and all it's dependencies to serve incoming user requests
type API struct {
	Cfg *Config

	Logger   *zap.Logger
	KafkaSvc *kafka.Service
	OwlSvc   *owl.Service

	Hooks *Hooks // Hooks to add additional functionality from the outside at different places (used by Kafka Owl Business)
}

// New creates a new API instance
func New(cfg *Config) *API {
	logger := logging.NewLogger(&cfg.Logger, cfg.MetricsNamespace)

	kafkaSvc, err := kafka.NewService(cfg.Kafka, logger, cfg.MetricsNamespace)
	if err != nil {
		logger.Fatal("failed to create kafka service", zap.Error(err))
	}

	return &API{
		Cfg:      cfg,
		Logger:   logger,
		KafkaSvc: kafkaSvc,
		OwlSvc:   owl.NewService(kafkaSvc, logger),
		Hooks:    newDefaultHooks(),
	}
}

// Start the API server and block
func (api *API) Start() {
	api.KafkaSvc.RegisterMetrics()
	api.KafkaSvc.Start()

	// Server
	server := rest.NewServer(&api.Cfg.REST, api.Logger, api.routes())
	err := server.Start()
	if err != nil {
		api.Logger.Fatal("REST Server returned an error", zap.Error(err))
	}
}
