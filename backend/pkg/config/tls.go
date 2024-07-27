package config

import (
	"crypto/tls"
	"flag"

	"github.com/twmb/tlscfg"
)

// TLS represents generic TLS configuration options.
type TLS struct {
	Enabled               bool   `yaml:"enabled"`
	CaFilepath            string `yaml:"caFilepath"`
	CertFilepath          string `yaml:"certFilepath"`
	KeyFilepath           string `yaml:"keyFilepath"`
	InsecureSkipTLSVerify bool   `yaml:"insecureSkipTlsVerify"`
}

// SetDefaults for the TLS config.
func (c *TLS) SetDefaults() {
	c.Enabled = false
}

// Validate the TLS config.
func (c *TLS) Validate() error {
	if !c.Enabled {
		return nil
	}

	_, err := c.TLSConfig()
	return err
}

// TLSConfig returns the TLS Config from the configured parameters
func (c *TLS) TLSConfig(overrides ...func(cfg *tls.Config) error) (*tls.Config, error) {
	if !c.Enabled {
		return &tls.Config{
			MinVersion: tls.VersionTLS12,
		}, nil
	}

	opts := []tlscfg.Opt{
		tlscfg.MaybeWithDiskCA(c.CaFilepath, tlscfg.ForClient),
		tlscfg.MaybeWithDiskKeyPair(c.CertFilepath, c.KeyFilepath),
		tlscfg.WithOverride(func(cfg *tls.Config) error {
			cfg.InsecureSkipVerify = c.InsecureSkipTLSVerify
			return nil
		}),
	}

	if len(overrides) > 0 {
		for _, o := range overrides {
			opts = append(opts, tlscfg.WithOverride(o))
		}
	}

	tlsconfig, err := tlscfg.New(opts...)
	if err != nil {
		return nil, err
	}

	return tlsconfig, nil
}

// RegisterFlags for all sensitive Kafka TLS configs
func (*TLS) RegisterFlags(*flag.FlagSet) {}
