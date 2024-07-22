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
func (*TLS) Validate() error {
	return nil
}

// TLSConfig returns the TLS Config from the configured parameters
func (c *TLS) TLSConfig() (*tls.Config, error) {
	if !c.Enabled {
		return &tls.Config{
			MinVersion: tls.VersionTLS12,
		}, nil
	}

	tlsconfig, err := tlscfg.New(
		tlscfg.MaybeWithDiskCA(c.CaFilepath, tlscfg.ForClient),
		tlscfg.MaybeWithDiskKeyPair(c.CertFilepath, c.KeyFilepath),
	)
	if err != nil {
		return nil, err
	}

	tlsconfig.InsecureSkipVerify = c.InsecureSkipTLSVerify

	return tlsconfig, nil
}

// RegisterFlags for all sensitive Kafka TLS configs
func (*TLS) RegisterFlags(*flag.FlagSet) {}
