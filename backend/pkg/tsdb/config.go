package tsdb

import (
	"flag"
	"time"
)

type Config struct {
	// Enabled configures whether the time series function is enabled or not.
	Enabled bool `yaml:"enabled"`

	// CacheRetention is the duration the time series data is kept in memory
	CacheRetention time.Duration `yaml:"cacheRetention"`

	// ScrapeInterval is the interval how often the data shall be fetched from Kafka to be persisted as datapoint
	// in the time series database.
	ScrapeInterval time.Duration `yaml:"scrapeInterval"`

	// Persistence that can be used by the time series database so that data is not only kept in memory and
	// therefore also persistent across application restarts/crashes.
	Persistence PersistenceConfig `yaml:"persistence"`
}

func (c *Config) SetDefaults() {
	c.Enabled = true
	c.CacheRetention = 6 * time.Hour
}

func (c *Config) RegisterFlags(f *flag.FlagSet) {
}

func (c *Config) Validate() error {
	return nil
}
