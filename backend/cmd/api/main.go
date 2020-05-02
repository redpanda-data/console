package main

import (
	"flag"
	"go.uber.org/zap"
	"os"
	"strconv"
	"time"

	"github.com/cloudhut/common/flagext"
	"github.com/cloudhut/kowl/backend/pkg/api"
)

func main() {
	startupLogger := zap.NewExample()
	printVersion(startupLogger)

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

func printVersion(logger *zap.Logger) {
	sha1 := os.Getenv("REACT_APP_KOWL_GIT_SHA")
	ref1 := os.Getenv("REACT_APP_KOWL_GIT_REF")
	timestamp1 := os.Getenv("REACT_APP_KOWL_TIMESTAMP")

	if len(sha1) == 0 {
		logger.Info("started Kowl", zap.String("version", "dev"))
	} else {
		t1, err := strconv.ParseInt(timestamp1, 10, 64)
		var timeStr1 string
		if err != nil {
			logger.Warn("failed to parse timestamp as int64", zap.String("timestamp", timestamp1), zap.Error(err))
			timeStr1 = "(parsing error)"
		} else {
			timeStr1 = time.Unix(t1, 0).Format(time.RFC3339)
		}
		logger.Info("started Kowl",
			zap.String("version", ref1),
			zap.String("built", timeStr1),
			zap.String("git_sha", sha1))
	}
}
