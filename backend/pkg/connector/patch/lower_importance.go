// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package patch

import (
	"regexp"

	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

type ConfigPatchLowerImportance struct {
	// ConfigurationKeySelector defines what configuration keys (e.g. `tasks.max`) shall be
	// matched. The Config patch will be applied to all configuration keys where the configuration
	// key and connector class selector match.
	ConfigurationKeySelector IncludeExcludeSelector

	// ConnectorClassSelector defines what connector classes
	// (e.g. `org.apache.kafka.connect.mirror.MirrorSourceConnector`) shall be matched.
	// The Config patch will be applied to all configuration keys where the configuration
	// key and connector class selector match.
	ConnectorClassSelector IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchLowerImportance)(nil)

func NewConfigPatchLowerImportance() *ConfigPatchLowerImportance {
	return &ConfigPatchLowerImportance{
		ConfigurationKeySelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`(ssl\..*|header.converter)`),
			Exclude: nil,
		},
		ConnectorClassSelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(".*"),
			Exclude: nil,
		},
	}
}

// IsMatch implements the ConfigPatch.IsMatch interface.
func (c *ConfigPatchLowerImportance) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
func (c *ConfigPatchLowerImportance) PatchDefinition(d model.ConfigDefinition) model.ConfigDefinition {
	d.SetImportance(model.ConfigDefinitionImportanceLow)
	return d
}
