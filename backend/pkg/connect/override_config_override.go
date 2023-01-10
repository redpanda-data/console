// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package connect

import "fmt"

// ConfigOverride defines a config key selector (regex) along with a block of config options
// that shall override the config  if a config key matches the regex.
type ConfigOverride struct {
	NameSelector Regexp                 `json:"nameSelector"`
	Definition   map[string]interface{} `json:"definition,omitempty"`
	Value        map[string]interface{} `json:"value,omitempty"`
}

// Validate the configured override.
func (c *ConfigOverride) Validate() error {
	if c.NameSelector.Regexp == nil {
		return fmt.Errorf("name selector must be set")
	}

	return nil
}

// IsConfigKeyMatch checks if the name selector matches the given configKey
func (c *ConfigOverride) IsConfigKeyMatch(configKey string) bool {
	return c.NameSelector.MatchString(configKey)
}
