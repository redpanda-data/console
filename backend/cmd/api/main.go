package main

import (
	"go.uber.org/zap"

	"github.com/cloudhut/kowl/backend/pkg/api"
)

func main() {
	startupLogger := zap.NewExample()

	cfg, err := api.LoadConfig(startupLogger)
	if err != nil {
		startupLogger.Fatal("failed to load yaml config", zap.Error(err))
	}
	err = cfg.Validate()
	if err != nil {
		startupLogger.Fatal("failed to validate config", zap.Error(err))
	}

	a := api.New(&cfg)
	a.Start()
}
