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

type ConfigPatchUpperImportance struct {
	ConfigurationKeySelector IncludeExcludeSelector
	ConnectorClassSelector   IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchUpperImportance)(nil)

func NewConfigPatchUpperImportance() *ConfigPatchUpperImportance {
	return &ConfigPatchUpperImportance{
		ConfigurationKeySelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`(key.converter|value.converter)`),
			Exclude: nil,
		},
		ConnectorClassSelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(".*"),
			Exclude: nil,
		},
	}
}

// IsMatch implements the ConfigPatch.IsMatch interface.
func (c *ConfigPatchUpperImportance) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
func (c *ConfigPatchUpperImportance) PatchDefinition(d model.ConfigDefinition) model.ConfigDefinition {
	d.SetImportance(model.ConfigDefinitionImportanceHigh)
	return d
}
