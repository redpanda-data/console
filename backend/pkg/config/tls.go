package config

import (
	"context"
	"crypto/tls"
	"flag"
	"log/slog"
	"time"

	"github.com/twmb/tlscfg"

	tlspkg "github.com/redpanda-data/console/backend/pkg/tls"
)

// TLS represents generic TLS configuration options.
type TLS struct {
	Enabled               bool   `yaml:"enabled"`
	CaFilepath            string `yaml:"caFilepath"`
	CertFilepath          string `yaml:"certFilepath"`
	KeyFilepath           string `yaml:"keyFilepath"`
	InsecureSkipTLSVerify bool   `yaml:"insecureSkipTlsVerify"`
	// RefreshInterval is the interval at which the TLS configuration will be refreshed, from disk.
	RefreshInterval time.Duration `yaml:"refreshInterval"`
}

// SetDefaults for the TLS config.
func (c *TLS) SetDefaults() {
	c.Enabled = false
	c.RefreshInterval = 5 * time.Minute
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

// TLSConfigWithReloader returns the TLS Config from the configured parameters
// and additionally starts a goroutine to hot refresh certificates at
// RefreshInterval
func (c *TLS) TLSConfigWithReloader(ctx context.Context, logger *slog.Logger, hostname string, overrides ...func(cfg *tls.Config) error) (*tls.Config, error) {
	if !c.Enabled {
		return &tls.Config{
			MinVersion: tls.VersionTLS12,
		}, nil
	}

	opts := []tlscfg.Opt{
		tlscfg.WithOverride(func(cfg *tls.Config) error {
			cfg.InsecureSkipVerify = c.InsecureSkipTLSVerify
			return nil
		}),
		tlscfg.WithOverride(
			tlspkg.MaybeWithDynamicClientCA(
				ctx,
				c.CaFilepath,
				hostname,
				c.RefreshInterval,
				logger,
			),
		),
		tlscfg.WithOverride(
			tlspkg.MaybeWithDynamicDiskKeyPair(
				ctx,
				c.CertFilepath,
				c.KeyFilepath,
				tlscfg.ForClient,
				c.RefreshInterval,
				logger,
			),
		),
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
