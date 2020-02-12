package api

import (
	"flag"

	"github.com/cloudhut/common/logging"
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kafka-owl/backend/pkg/kafka"
	"github.com/cloudhut/kafka-owl/backend/pkg/owl"
)

// Config holds all (subdependency)Configs needed to run the API
type Config struct {
	MetricsNamespace string

	REST   rest.Config
	Kafka  kafka.Config
	Logger logging.Config
	Owl    owl.Config
}

// RegisterFlags for all (sub)configs
func (c *Config) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.MetricsNamespace, "api.metrics.namespace", "api", "Prefix for all prometheus metrics")

	c.REST.RegisterFlags(f)
	c.Kafka.RegisterFlags(f)
	c.Logger.RegisterFlags(f)
	c.Owl.RegisterFlags(f)
}
