package api

import (
	"flag"

	"github.com/kafka-owl/kafka-owl/pkg/common/logging"
	"github.com/kafka-owl/kafka-owl/pkg/common/rest"
	"github.com/kafka-owl/kafka-owl/pkg/kafka"
)

// Config holds all (subdependency)Configs needed to run the API
type Config struct {
	MetricsNamespace string
	REST             rest.Config
	Kafka            kafka.Config
	Logger           logging.Config
}

// RegisterFlags for all (sub)configs
func (c *Config) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.MetricsNamespace, "api.metrics.namespace", "api", "Prefix for all prometheus metrics")

	c.REST.RegisterFlags(f)
	c.Kafka.RegisterFlags(f)
	c.Logger.RegisterFlags(f)
}
