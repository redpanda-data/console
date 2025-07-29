// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

// Analytics contains configuration options for analytics and telemetry.
type Analytics struct {
	// Enabled determines whether analytics/tracking scripts should be loaded in the frontend.
	// When set to false, all tracking scripts (like Hubspot) will be disabled.
	Enabled bool `yaml:"enabled"`
}

// SetDefaults for Analytics config.
func (c *Analytics) SetDefaults() {
	c.Enabled = true
}

// Validate Analytics configurations.
func (c *Analytics) Validate() error {
	// No validation needed for analytics config
	_ = c // avoid unused receiver warning
	return nil
}
