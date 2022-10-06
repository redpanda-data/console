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
	"net/url"
)

// Schema Config for using a (Confluent) Schema Registry
type Schema struct {
	Enabled bool     `yaml:"enabled"`
	URLs    []string `yaml:"urls"`

	// Credentials
	Username    string `yaml:"username"`
	Password    string `yaml:"password"`
	BearerToken string `yaml:"bearerToken"`

	// TLS / Custom CA
	TLS SchemaTLS `yaml:"tls"`
}

// RegisterFlags registers all nested config flags.
func (c *Schema) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Password, "schema.registry.password", "", "Password for authenticating against the schema registry (optional)")
	f.StringVar(&c.BearerToken, "schema.registry.token", "", "Bearer token for authenticating against the schema registry (optional)")
}

func (c *Schema) Validate() error {
	if c.Enabled == false {
		return nil
	}

	if len(c.URLs) == 0 {
		return fmt.Errorf("schema registry is enabled but no URL is configured")
	}

	for _, u := range c.URLs {
		urlParsed, err := url.Parse(u)
		if err != nil {
			return fmt.Errorf("failed to parse schema registry url %q: %w", u, err)
		}
		switch urlParsed.Scheme {
		case "http":
			if c.TLS.Enabled {
				return fmt.Errorf("URL scheme is http (given URL: %q), but you have TLS enabled. Change URL schema to https", u)
			}
		case "https":
			if !c.TLS.Enabled {
				return fmt.Errorf("URL scheme is https (given URL: %q), but you have TLS disabled. Change URL scheme to http", u)
			}
		default:
			return fmt.Errorf("URL scheme must either be http or https, but got %q in url: %q", urlParsed.Scheme, u)
		}
	}

	return nil
}
