// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"errors"
	"flag"
	"fmt"
)

// SQL holds the configuration for connecting to Redpanda SQL over the
// Postgres wire protocol.
type SQL struct {
	Enabled bool `yaml:"enabled"`
	// URL is the Postgres-wire endpoint in host:port form (e.g. "rpsql:5432").
	URL string `yaml:"url"`

	Authentication HTTPAuthentication `yaml:"authentication"`
	TLS            TLS                `yaml:"tls"`
}

// RegisterFlags registers flags for sensitive SQL authentication inputs.
func (c *SQL) RegisterFlags(f *flag.FlagSet) {
	c.Authentication.RegisterFlags(f, "sql.")
}

// SetDefaults for the SQL configuration.
func (c *SQL) SetDefaults() {
	c.Enabled = false
	c.TLS.SetDefaults()
}

// Validate the SQL configuration.
func (c *SQL) Validate() error {
	if !c.Enabled {
		return nil
	}

	if c.URL == "" {
		return errors.New("sql is enabled but no URL is configured")
	}

	if err := c.TLS.Validate(); err != nil {
		return fmt.Errorf("invalid sql tls config: %w", err)
	}

	// Mutual exclusion: impersonation forwards the user's session bearer as the
	// upstream credential, so static credentials must not also be set.
	isAuthSet := c.Authentication.BearerToken != "" || c.Authentication.BasicAuth.Username != "" || c.Authentication.BasicAuth.Password != ""
	if c.Authentication.ImpersonateUser && isAuthSet {
		return errors.New("sql authentication cannot set impersonateUser together with static basic/bearer credentials")
	}

	return nil
}
