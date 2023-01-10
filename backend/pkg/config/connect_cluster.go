// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"flag"
	"fmt"
)

// ConnectCluster is the configuration of a single Kafka connect cluster.
type ConnectCluster struct {
	// Name will be shown in the Frontend to identify a connect cluster
	Name string `yaml:"name"`
	// URL is the HTTP address that will be set as base url for all requests
	URL string `yaml:"url"`

	// Authentication configuration
	//
	TLS      ConnectClusterTLS `yaml:"tls"`
	Username string            `yaml:"username"`
	Password string            `yaml:"password"`
	Token    string            `yaml:"token"`
}

// RegisterFlagsWithPrefix registers all nested config flags.
func (c *ConnectCluster) RegisterFlagsWithPrefix(f *flag.FlagSet, prefix string) {
	f.StringVar(&c.Password, prefix+"password", "", "Basic auth password for connect cluster authentication")
	f.StringVar(&c.Token, prefix+"token", "", "Bearer token for connect cluster authentication")
}

// SetDefaults for a target Kafka connect cluster.
func (c *ConnectCluster) SetDefaults() {
	c.TLS.SetDefaults()
}

// Validate Kafka connect cluster configurations provided by the user.
func (c *ConnectCluster) Validate() error {
	if c.Name == "" {
		return fmt.Errorf("a cluster name must be set to identify the connect cluster")
	}

	if c.URL == "" {
		return fmt.Errorf("url to access the Connect cluster API must be set")
	}

	err := c.TLS.Validate()
	if err != nil {
		return fmt.Errorf("failed to validate TLS config: %w", err)
	}

	return nil
}
