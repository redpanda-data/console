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
	"errors"
	"flag"
	"fmt"
	"net/url"
)

// Schema Config for using a (Confluent) Schema Registry
type Schema struct {
	Enabled bool     `yaml:"enabled"`
	URLs    []string `yaml:"urls"`

	Authentication HTTPAuthentication `yaml:"authentication"`

	// TLS / Custom CA
	TLS TLS `yaml:"tls"`
}

// RegisterFlags registers all nested config flags.
func (c *Schema) RegisterFlags(f *flag.FlagSet) {
	c.Authentication.RegisterFlags(f, "schema.registry.")
}

// Validate the schema registry configurations.
func (c *Schema) Validate() error {
	if !c.Enabled {
		return nil
	}

	if len(c.URLs) == 0 {
		return errors.New("schema registry is enabled but no URL is configured")
	}

	for _, u := range c.URLs {
		_, err := url.Parse(u)
		if err != nil {
			return fmt.Errorf("failed to parse schema registry url %q: %w", u, err)
		}
	}

	return nil
}
