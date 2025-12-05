// Copyright 2025 Redpanda Data, Inc.
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
	"fmt"
	"net/url"
)

// BSR Config for using Buf Schema Registry (BSR)
type BSR struct {
	Enabled bool   `yaml:"enabled"`
	URL     string `yaml:"url"`

	// Token is the authentication token for the BSR
	Token string `yaml:"token"`
}

// Validate the BSR configurations.
func (c *BSR) Validate() error {
	if !c.Enabled {
		return nil
	}

	if c.URL == "" {
		return errors.New("BSR is enabled but no URL is configured")
	}

	_, err := url.Parse(c.URL)
	if err != nil {
		return fmt.Errorf("failed to parse BSR url %q: %w", c.URL, err)
	}

	if c.Token == "" {
		return errors.New("BSR is enabled but no authentication token is configured")
	}

	return nil
}
