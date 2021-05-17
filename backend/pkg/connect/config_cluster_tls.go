package connect

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"io/ioutil"
)

// ConfigClusterTLS is the config if you want to connect to Kafka connect REST API via (mutual) TLS
type ConfigClusterTLS struct {
	Enabled               bool   `yaml:"enabled"`
	CaFilepath            string `yaml:"caFilepath"`
	CertFilepath          string `yaml:"certFilepath"`
	KeyFilepath           string `yaml:"keyFilepath"`
	InsecureSkipTLSVerify bool   `yaml:"insecureSkipTlsVerify"`
}

func (c *ConfigClusterTLS) SetDefaults() {
	c.Enabled = false
}

func (c *ConfigClusterTLS) Validate() error {
	if !c.Enabled {
		return nil
	}

	return nil
}

func (c *ConfigClusterTLS) TLSConfig() (*tls.Config, error) {
	if !c.Enabled {
		return &tls.Config{}, nil
	}

	// 1. Create CA cert pool
	caCertPool := x509.NewCertPool()
	if c.CaFilepath != "" {
		ca, err := ioutil.ReadFile(c.CaFilepath)
		if err != nil {
			return nil, err
		}
		isSuccessful := caCertPool.AppendCertsFromPEM(ca)
		if !isSuccessful {
			return nil, fmt.Errorf("failed to append ca file to cert pool, is this a valid PEM format?")
		}
	}

	// 2. If configured load TLS cert & key - Mutual TLS
	var certificates []tls.Certificate
	if c.CertFilepath != "" && c.KeyFilepath != "" {
		cert, err := ioutil.ReadFile(c.CertFilepath)
		if err != nil {
			return nil, fmt.Errorf("failed to read cert file for schema registry client: %w", err)
		}

		privateKey, err := ioutil.ReadFile(c.KeyFilepath)
		if err != nil {
			return nil, fmt.Errorf("failed to read key file for schema registry client: %w", err)
		}

		pemBlock, _ := pem.Decode(privateKey)
		if pemBlock == nil {
			return nil, fmt.Errorf("no valid private key found")
		}

		tlsCert, err := tls.X509KeyPair(cert, privateKey)
		if err != nil {
			return nil, fmt.Errorf("failed to load certificate pair for schema registry client: %w", err)
		}
		certificates = []tls.Certificate{tlsCert}
	}

	return &tls.Config{
		InsecureSkipVerify: c.InsecureSkipTLSVerify,
		Certificates:       certificates,
		RootCAs:            caCertPool,
	}, nil
}
