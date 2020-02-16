package main

import (
	"flag"
	"fmt"
	"github.com/cloudhut/common/flagext"
	"github.com/cloudhut/kafka-owl/backend/pkg/api"
	"os"
)

func main() {
	cfg := &api.Config{}
	cfg.SetDefaults()
	flagext.RegisterFlags(cfg)
	flag.Parse()

	// This can not be part of the Config's validate() method because we haven't decoded the YAML config at this point
	if cfg.ConfigFilepath == "" {
		fmt.Fprint(os.Stderr, "you must specify the path to the config filepath using the --config.filepath flag")
		os.Exit(1)
	}

	err := api.LoadConfig(cfg.ConfigFilepath, cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load yaml config: %s", err)
		os.Exit(1)
	}
	err = cfg.Validate()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to validate config: %s", err)
		os.Exit(1)
	}

	a := api.New(cfg)
	a.Start()
}
