package schema

import (
	"flag"
	"fmt"
)

// Config for using a (Confluent) Schema Registry
type Config struct {
	Enabled bool     `yaml:"enabled"`
	URLs    []string `yaml:"urls"`

	// Credentials
	Username    string `yaml:"username"`
	Password    string `yaml:"password"`
	BearerToken string `yaml:"bearerToken"`

	// TLS / Custom CA
	TLS TLSConfig `yaml:"tls"`

	// Timeouts
	Timeout int `yaml:"timeout"`
}

// RegisterFlags registers all nested config flags.
func (c *Config) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Password, "schema.registry.password", "", "Password for authenticating against the schema registry (optional)")
	f.StringVar(&c.BearerToken, "schema.registry.token", "", "Bearer token for authenticating against the schema registry (optional)")
}

func (c *Config) Validate() error {
	if c.Enabled == false {
		return nil
	}

	if c.Timeout == 0 {
		c.Timeout = 5
	}

	if len(c.URLs) == 0 {
		return fmt.Errorf("schema registry is enabled but no URL is configured")
	}

	return nil
}
