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

type RedpandaAdminAPI struct {
	Enabled bool     `yaml:"enabled"`
	URLs    []string `yaml:"urls"`

	// Basic Auth Credentials
	Username string `yaml:"username"`
	Password string `yaml:"password"`

	// TLS Config
	TLS RedpandaAdminAPITLS `yaml:"tls"`
}

func (c *RedpandaAdminAPI) RegisterFlags(flags *flag.FlagSet) {
	flags.BoolVar(&c.Enabled, "redpanda.admin-api.password", c.Enabled, "Basic Auth password to authenticate against the Redpanda Admin API")
}

func (c *RedpandaAdminAPI) SetDefaults() {
	c.Enabled = false
}

func (c *RedpandaAdminAPI) Validate() error {
	if !c.Enabled {
		return nil
	}

	if len(c.URLs) == 0 {
		return fmt.Errorf("you must specify at least one URL")
	}

	for _, u := range c.URLs {
		urlParsed, err := url.Parse(u)
		if err != nil {
			return fmt.Errorf("failed to parse redpanda admin api url %q: %w", u, err)
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

	if err := c.TLS.Validate(); err != nil {
		return fmt.Errorf("invalid TLS config: %w", err)
	}

	return nil
}
