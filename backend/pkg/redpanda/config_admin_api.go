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
	"flag"
	"fmt"
)

type AdminAPIConfig struct {
	Enabled bool     `yaml:"enabled"`
	URLs    []string `yaml:"urls"`

	// Basic Auth Credentials
	Username string `yaml:"username"`
	Password string `yaml:"password"`

	// TLS Config
	TLS TLSConfig `yaml:"tls"`
}

func (c *AdminAPIConfig) RegisterFlags(flags *flag.FlagSet) {
	flags.BoolVar(&c.Enabled, "redpanda.admin-api.password", c.Enabled, "Basic Auth password to authenticate against the Redpanda Admin API")
}

func (c *AdminAPIConfig) SetDefaults() {
	c.Enabled = false
}

func (c *AdminAPIConfig) Validate() error {
	if !c.Enabled {
		return nil
	}

	if err := c.TLS.Validate(); err != nil {
		return fmt.Errorf("invalid TLS config: %w", err)
	}

	return nil
}
