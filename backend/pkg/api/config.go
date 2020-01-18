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
	MetricsNamespace            string

	PrintAccessLogs             bool   // When true, will log every accessed REST route along with many headers to the console.
	AccessLogExtraHeader        string // An additional header that will be included, for example: https://cloud.google.com/iap/docs/identity-howto
	BlockWhenExtraHeaderMissing bool   // When the extra header is given in the config, but missing in an incoming request, the request will be blocked (returning a 401)

	REST   rest.Config
	Kafka  kafka.Config
	Logger logging.Config
	Owl    owl.Config
}

// RegisterFlags for all (sub)configs
func (c *Config) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.MetricsNamespace, "api.metrics.namespace", "api", "Prefix for all prometheus metrics")
	f.BoolVar(&c.PrintAccessLogs, "logging.print-access-logs", false, "Whether or not to print access log for each HTTP invocation")
	f.StringVar(&c.AccessLogExtraHeader, "logging.access-log-extra-header", "X-Goog-Authenticated-User-Email", "Name of an additional header to include in the Access Logs. Intended to capture the current user that sent the request (obviously only works when there's a proxy that actually adds the header, like Googles Cloud IAP: `X-Goog-Authenticated-User-Email`")
	f.BoolVar(&c.BlockWhenExtraHeaderMissing, "logging.block-when-extra-header-missing", false, "When  true and an incoming request does not have a value for the header 'logging.access-log-extra-header' it will be blocked (returning 400)")

	c.REST.RegisterFlags(f)
	c.Kafka.RegisterFlags(f)
	c.Logger.RegisterFlags(f)
	c.Owl.RegisterFlags(f)
}
