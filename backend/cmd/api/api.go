package main

import (
	"github.com/weeco/kafka-explorer/pkg/common/rest"
	"github.com/weeco/kafka-explorer/pkg/kafka"
	"go.uber.org/zap"
)

// API represents the server and all it's dependencies to serve incoming user requests
type API struct {
	cfg        *Config
	logger     *zap.Logger
	restHelper *rest.Helper
	kafkaSvc   *kafka.Service
}

// Start the REST server
func (api *API) Start() {
	// Server
	server := rest.NewServer(&api.cfg.REST, api.logger, api.routes())
	err := server.Start()
	if err != nil {
		api.logger.Fatal("REST Server returned an error", zap.Error(err))
	}
}
