package main

import (
	"flag"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/cloudhut/common/flagext"
	"github.com/cloudhut/kowl/backend/pkg/api"
)

func main() {
	printVersion()

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

func printVersion() {
	sha1 := os.Getenv("REACT_APP_KOWL_GIT_SHA")
	ref1 := os.Getenv("REACT_APP_KOWL_GIT_REF")
	timestamp1 := os.Getenv("REACT_APP_KOWL_TIMESTAMP")

	if len(sha1) == 0 {
		fmt.Printf("KOWL (dev)\n")
	} else {
		t1, err := strconv.ParseInt(timestamp1, 10, 64)
		var timeStr1 string
		if err != nil {
			fmt.Printf("Timestamp1 %v cannot be parsed as int64: %v", timestamp1, err.Error())
			timeStr1 = "(parsing error)"
		} else {
			timeStr1 = time.Unix(t1, 0).Format(time.RFC3339)
		}
		fmt.Printf("KOWL (Version: %v) (Built: %v) (Commit: %v)\n", ref1, timeStr1, sha1)
	}
}
