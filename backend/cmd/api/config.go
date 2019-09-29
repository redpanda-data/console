package main

import (
	"flag"

	"github.com/weeco/kafka-explorer/pkg/common/logging"
	"github.com/weeco/kafka-explorer/pkg/common/rest"
	"github.com/weeco/kafka-explorer/pkg/kafka"
)

// Config holds all (subdependency)Configs needed to run the API
type Config struct {
	MetricsNamespace  string
	FrontendDirectory string
	ServeFrontend     bool
	REST              rest.Config
	Kafka             kafka.Config
	Logger            logging.Config
}

// RegisterFlags for all (sub)configs
func (c *Config) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.MetricsNamespace, "api.metrics.namespace", "api", "Prefix for all prometheus metrics")
	f.BoolVar(&c.ServeFrontend, "serve-frontend", true, "Whether or not to serve the static Frontend files.")

	c.REST.RegisterFlags(f)
	c.Kafka.RegisterFlags(f)
	c.Logger.RegisterFlags(f)
}
