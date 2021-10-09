package api

import (
	"context"
	"github.com/cloudhut/common/logging"
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/connect"
	"github.com/cloudhut/kowl/backend/pkg/git"
	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"github.com/cloudhut/kowl/backend/pkg/tsdb"
	"go.uber.org/zap"
)

// API represents the server and all it's dependencies to serve incoming user requests
type API struct {
	Cfg *Config

	Logger     *zap.Logger
	KafkaSvc   *kafka.Service
	OwlSvc     *owl.Service
	ConnectSvc *connect.Service
	GitSvc     *git.Service
	TsdbSvc    *tsdb.Service

	Hooks *Hooks // Hooks to add additional functionality from the outside at different places (used by Kafka Owl Business)

	version versionInfo
}

// New creates a new API instance
func New(cfg *Config) *API {
	logger := logging.NewLogger(&cfg.Logger, cfg.MetricsNamespace)

	version := loadVersionInfo(logger)

	// Print startup message
	if version.isBusiness {
		logger.Info("started "+version.productName,
			zap.String("version", version.gitRef),
			zap.String("git_sha", version.gitSha),
			zap.String("built", version.timestampFriendly),
			zap.String("version_business", version.gitRefBusiness),
			zap.String("git_sha_business", version.gitShaBusiness),
		)
	} else {
		logger.Info("started "+version.productName,
			zap.String("version", version.gitRef),
			zap.String("git_sha", version.gitSha),
			zap.String("built", version.timestampFriendly),
		)
	}

	kafkaSvc, err := kafka.NewService(cfg.Kafka, logger, cfg.MetricsNamespace)
	if err != nil {
		logger.Fatal("failed to create kafka service", zap.Error(err))
	}

	owlSvc, err := owl.NewService(cfg.Owl, logger, kafkaSvc)
	if err != nil {
		logger.Fatal("failed to create owl service", zap.Error(err))
	}

	connectSvc, err := connect.NewService(cfg.Connect, logger)
	if err != nil {
		logger.Fatal("failed to create Kafka connect service", zap.Error(err))
	}

	tsdbSvc, err := tsdb.NewService(cfg.TSDB, logger, owlSvc)
	if err != nil {
		logger.Fatal("failed to create TSDB service", zap.Error(err))
	}

	return &API{
		Cfg:        cfg,
		Logger:     logger,
		KafkaSvc:   kafkaSvc,
		OwlSvc:     owlSvc,
		ConnectSvc: connectSvc,
		TsdbSvc:    tsdbSvc,
		Hooks:      newDefaultHooks(),
		version:    version,
	}
}

// Start the API server and block
func (api *API) Start() {
	err := api.KafkaSvc.Start()
	if err != nil {
		api.Logger.Fatal("failed to start kafka service", zap.Error(err))
	}

	err = api.OwlSvc.Start()
	if err != nil {
		api.Logger.Fatal("failed to start owl service", zap.Error(err))
	}

	err = api.TsdbSvc.Start(context.Background())
	if err != nil {
		api.Logger.Fatal("failed to start tsdb service", zap.Error(err))
	}

	// Server
	server := rest.NewServer(&api.Cfg.REST, api.Logger, api.routes())
	err = server.Start()
	if err != nil {
		api.Logger.Fatal("REST Server returned an error", zap.Error(err))
	}
}
