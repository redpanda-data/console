// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package model

// ConfigDefinitionKey represents all configuration properties that will
// be parsed from JSON.
type ConfigDefinitionKey struct {
	Name         string               `json:"name"`
	Type         ConfigDefinitionType `json:"type"`
	DefaultValue string               `json:"default_value"`
	// CustomDefaultValue is a default value that we override. We use a separate variable
	// for it so that the frontend knows it has to override the actual connector default value.
	CustomDefaultValue *string                    `json:"custom_default_value,omitempty"`
	Importance         ConfigDefinitionImportance `json:"importance"`
	Documentation      string                     `json:"documentation"`
	Group              *string                    `json:"group"`
	Order              int                        `json:"order"`
	Width              ConfigDefinitionWidth      `json:"width"`
	Required           bool                       `json:"required"`
	DisplayName        string                     `json:"display_name"`
	Dependents         []string                   `json:"dependents"`
}

func (c *ConfigDefinitionKey) ToMap() map[string]any {
	return toJSONMapStringAny(c)
}
