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

// ConfigPatchCommon is a config patch that applies specific patches on a set of configurations
// that is common across several connectors (e.g. tasks.max).
type ConfigPatchCommon struct {
	ConfigurationKeySelector IncludeExcludeSelector
	ConnectorClassSelector   IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchAll)(nil)

func NewConfigPatchCommon() *ConfigPatchCommon {
	return &ConfigPatchCommon{
		ConfigurationKeySelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`(tasks.max|key.converter|value.converter|header.converter)`),
			Exclude: nil,
		},
		ConnectorClassSelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(".*"),
			Exclude: nil,
		},
	}
}

// IsMatch implements the ConfigPatch.IsMatch interface.
func (c *ConfigPatchCommon) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
func (c *ConfigPatchCommon) PatchDefinition(d model.ConfigDefinition) model.ConfigDefinition {
	switch d.Definition.Name {
	case "tasks.max":
		d.SetDisplayName("Max tasks").SetImportance(model.ConfigDefinitionImportanceHigh)
	case "key.converter":
		d.SetDisplayName("Kafka message key format").
			SetDocumentation("Format of the key in the Kafka topic. A valid schema must be available.").
			SetImportance(model.ConfigDefinitionImportanceHigh)
	case "value.converter":
		d.SetDisplayName("Kafka message value format").
			SetDocumentation("Format of the value in the Kafka topic. A valid schema must be available.").
			SetImportance(model.ConfigDefinitionImportanceHigh)
	case "header.converter":
		d.SetDisplayName("Kafka message headers format").
			SetDocumentation("Format of the headers in the Kafka topic. A valid schema must be available.").
			SetImportance(model.ConfigDefinitionImportanceLow)
	}
	return d
}
