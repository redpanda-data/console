package schema

import (
	"flag"
	"fmt"
)

// Config for using a (Confluent) Schema Registry
type Config struct {
	Enabled bool     `koanf:"enabled"`
	URLs    []string `koanf:"urls"`

	// Credentials
	Username    string `koanf:"username"`
	Password    string `koanf:"password"`
	BearerToken string `koanf:"bearerToken"`

	// TLS / Custom CA
	TLS TLSConfig `koanf:"tls"`
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

	if len(c.URLs) == 0 {
		return fmt.Errorf("schema registry is enabled but no URL is configured")
	}

	return nil
}
