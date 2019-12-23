package api

import (
	"flag"

	"github.com/kafka-owl/common/logging"
	"github.com/kafka-owl/common/rest"
	"github.com/kafka-owl/kafka-owl/pkg/kafka"
	"github.com/kafka-owl/kafka-owl/pkg/owl"
)

// Config holds all (subdependency)Configs needed to run the API
type Config struct {
	MetricsNamespace string
	PrintAccessLogs bool

	REST             rest.Config
	Kafka            kafka.Config
	Logger           logging.Config
	Owl              owl.Config
}

// RegisterFlags for all (sub)configs
func (c *Config) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.MetricsNamespace, "api.metrics.namespace", "api", "Prefix for all prometheus metrics")
	f.BoolVar(&c.PrintAccessLogs, "logging.print-access-logs", false, "Whether or not to print access log for each HTTP invocation")

	c.REST.RegisterFlags(f)
	c.Kafka.RegisterFlags(f)
	c.Logger.RegisterFlags(f)
	c.Owl.RegisterFlags(f)
}
