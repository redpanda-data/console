package tsdb

import (
	"flag"
	"time"
)

type Config struct {
	Enabled        bool          `yaml:"enabled"`
	Retention      time.Duration `yaml:"retention"`
	ScrapeInterval time.Duration `yaml:"scrapeInterval"`
}

func (c *Config) SetDefaults() {
	c.Enabled = true
	c.Retention = 6 * time.Hour
}

func (c *Config) RegisterFlags(f *flag.FlagSet) {
}

func (c *Config) Validate() error {
	return nil
}
