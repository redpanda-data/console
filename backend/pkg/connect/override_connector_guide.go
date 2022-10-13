// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package connect

import (
	"embed"
	"fmt"
)

//go:embed guides/*.json
var connectorGuides embed.FS

// ConnectorGuide is the schema that is used for each connector that shall be optimized
// in the UI wizard.
type ConnectorGuide struct {
	ConnectorClass string `json:"connectorClass"`

	// ConfigOverrides are JSON properties that shall override an existing config or
	// add a config block for a new config that usually is not reported by the validate
	// endpoint.
	ConfigOverrides []ConfigOverride `json:"configOverrides"`

	// ConfigRemovals is a list of config key selectors that shall be removed from the response,
	// so that they won't be rendered in the wizard form.
	ConfigRemovals []Regexp `json:"configRemovals"`
}

func (c *ConnectorGuide) Validate() error {
	if c.ConnectorClass == "" {
		return fmt.Errorf("connector class must be set")
	}

	for _, override := range c.ConfigOverrides {
		if err := override.Validate(); err != nil {
			return fmt.Errorf("failed to validate config override: %w", err)
		}
	}

	for _, removal := range c.ConfigRemovals {
		if removal.Regexp == nil {
			return fmt.Errorf("regex is nil")
		}
	}

	return nil
}

// GetConfigOverride returns the to be applied config override. A config override exists
// of two JSON objects (1x for definition & 1x for value). The given configName must
// match the nameSelector regex from the connector guide / override.
func (c *ConnectorGuide) GetConfigOverride(configName string) *ConfigOverride {
	for _, override := range c.ConfigOverrides {
		if override.IsConfigKeyMatch(configName) {
			return &override
		}
	}
	return nil
}

// MatchesConfigRemoval returns true if the given configName matches any of the
// regexes for keys that shall be removed from the visual setup guide.
func (c *ConnectorGuide) MatchesConfigRemoval(configName string) bool {
	for _, removal := range c.ConfigRemovals {
		if removal.MatchString(configName) {
			return true
		}
	}
	return false
}
