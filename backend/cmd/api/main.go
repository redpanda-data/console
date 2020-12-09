package main

import (
	"flag"

	"go.uber.org/zap"

	"github.com/cloudhut/common/flagext"
	"github.com/cloudhut/kowl/backend/pkg/api"
)

func main() {
	startupLogger := zap.NewExample()

	cfg := &api.Config{}
	cfg.SetDefaults()
	flagext.RegisterFlags(cfg)
	flag.Parse()

	// This can not be part of the Config's validate() method because we haven't decoded the YAML config at this point
	if cfg.ConfigFilepath == "" {
		startupLogger.Fatal("you must specify the path to the config filepath using the --config.filepath flag")
	}

	err := api.LoadConfig(cfg.ConfigFilepath, cfg)
	if err != nil {
		startupLogger.Fatal("failed to load yaml config", zap.Error(err))
	}
	err = cfg.Validate()
	if err != nil {
		startupLogger.Fatal("failed to validate config", zap.Error(err))
	}

	a := api.New(cfg)
	a.Start()
}
