// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package redpanda

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io/ioutil"
)

// TLSConfig to connect to the Redpanda Admin API.
type TLSConfig struct {
	Enabled               bool   `yaml:"enabled"`
	CaFilepath            string `yaml:"caFilepath"`
	CertFilepath          string `yaml:"certFilepath"`
	KeyFilepath           string `yaml:"keyFilepath"`
	InsecureSkipTLSVerify bool   `yaml:"insecureSkipTlsVerify"`
}

func (c *TLSConfig) BuildTLSConfig() (*tls.Config, error) {
	if !c.Enabled {
		return nil, nil
	}

	caCertPool := x509.NewCertPool()

	// No ca certificate specified, so let's return a TLS config that uses
	// the system cert pool.
	if c.CaFilepath == "" {
		return &tls.Config{
			RootCAs:            caCertPool,
			InsecureSkipVerify: c.InsecureSkipTLSVerify,
		}, nil
	}

	// Load the CA cert from the filepath.
	caCert, err := ioutil.ReadFile(c.CaFilepath)
	if err != nil {
		return nil, fmt.Errorf("failed to read CA cert from filepath %s: %w", c.CaFilepath, err)
	}
	if isSuccessful := caCertPool.AppendCertsFromPEM(caCert); !isSuccessful {
		return nil, fmt.Errorf("failed to append ca file to cert pool, check if this is a valid PEM formatted file")
	}

	// If configured load TLS cert & key - Mutual TLS
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

		tlsCert, err := tls.X509KeyPair(cert, privateKey)
		if err != nil {
			return nil, fmt.Errorf("failed to load certificate pair for schema registry client: %w", err)
		}
		certificates = []tls.Certificate{tlsCert}
	}

	return &tls.Config{
		RootCAs:            caCertPool,
		Certificates:       certificates,
		InsecureSkipVerify: c.InsecureSkipTLSVerify,
	}, nil
}

func (c *TLSConfig) Validate() error {
	if !c.Enabled {
		return nil
	}

	if _, err := c.BuildTLSConfig(); err != nil {
		return fmt.Errorf("failed to build TLS config: %w", err)
	}

	return nil
}
