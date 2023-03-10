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

// ConfigPatchLowerImportance is a patch to decrease the importance of common connector
// configurations.
type ConfigPatchLowerImportance struct {
	ConfigurationKeySelector IncludeExcludeSelector
	ConnectorClassSelector   IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchLowerImportance)(nil)

// NewConfigPatchLowerImportance returns a new patch to lower the importance of
// common connector configurations so that they are showed as advanced options in
// the frontend.
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
func (*ConfigPatchLowerImportance) PatchDefinition(d model.ConfigDefinition) model.ConfigDefinition {
	d.SetImportance(model.ConfigDefinitionImportanceLow)
	return d
}
