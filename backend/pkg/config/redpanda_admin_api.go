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

	"github.com/redpanda-data/common-go/rpadmin"
)

// RedpandaAdminAPI has the required configurations to make a connection to the
// Redpanda Admin API which is an HTTP server.
type RedpandaAdminAPI struct {
	Enabled bool     `yaml:"enabled"`
	URLs    []string `yaml:"urls"`

	Authentication HTTPAuthentication `yaml:"authentication"`

	// TLS Config
	TLS TLS `yaml:"tls"`

	// Startup contains relevant configurations such as connection max retries
	// for the initial Redpanda service creation.
	Startup ServiceStartupAttemptsOptions `yaml:"startup"`
}

// RegisterFlags for sensitive Admin API configurations.
func (c *RedpandaAdminAPI) RegisterFlags(flags *flag.FlagSet) {
	flags.BoolVar(&c.Enabled, "redpanda.admin-api.password", c.Enabled, "Basic Auth password to authenticate against the Redpanda Admin API")
}

// SetDefaults for Admin API configuration.
func (c *RedpandaAdminAPI) SetDefaults() {
	c.Enabled = false

	c.Startup.SetDefaults()

	c.TLS.SetDefaults()
}

// Validate Admin API configuration.
func (c *RedpandaAdminAPI) Validate() error {
	if !c.Enabled {
		return nil
	}

	if len(c.URLs) == 0 {
		return errors.New("you must specify at least one URL")
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

	err := c.Startup.Validate()
	if err != nil {
		return fmt.Errorf("failed to validate startup config: %w", err)
	}

	return nil
}

// RPAdminAuth returns the auth option that is required when constructing a new rpadmin.Client.
func (c *RedpandaAdminAPI) RPAdminAuth() rpadmin.Auth {
	if !c.Enabled || c.Authentication.ImpersonateUser {
		return &rpadmin.NopAuth{}
	}

	if c.Authentication.BasicAuth.Username != "" {
		return &rpadmin.BasicAuth{
			Username: c.Authentication.BasicAuth.Username,
			Password: c.Authentication.BasicAuth.Password,
		}
	}

	if c.Authentication.BearerToken != "" {
		return &rpadmin.BearerToken{Token: c.Authentication.BearerToken}
	}

	return &rpadmin.NopAuth{}
}
