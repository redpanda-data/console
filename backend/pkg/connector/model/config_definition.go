// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package model

import (
	"encoding/json"

	"github.com/cloudhut/connect-client"
)

// ConfigDefinition is a config object defined by Kafka connect for connectors implementing
// the Kafka connect framework.
//
// When calling a connector's validate endpoint the supported config definitions will be
// returned. Each config definition can also validate the provided user input and return
// validation errors.
type ConfigDefinition struct {
	Definition ConfigDefinitionKey   `json:"definition"`
	Value      ConfigDefinitionValue `json:"value"`
}

func NewConfigDefinitionFromValidationResult(result connect.ConnectorValidationResultConfig) ConfigDefinition {
	data, _ := json.Marshal(result)

	var configDef ConfigDefinition
	json.Unmarshal(data, &configDef)

	return configDef
}

func (c *ConfigDefinition) ToValidationResult() connect.ConnectorValidationResultConfig {
	return connect.ConnectorValidationResultConfig{
		Definition: c.Definition.ToMap(),
		Value:      c.Value.ToMap(),
	}
}

// SetImportance sets the importance of the config definition.
func (c *ConfigDefinition) SetImportance(importance ConfigDefinitionImportance) *ConfigDefinition {
	c.Definition.Importance = importance
	return c
}

// SetDisplayName sets the display name of the config definition.
func (c *ConfigDefinition) SetDisplayName(displayName string) *ConfigDefinition {
	c.Definition.DisplayName = displayName
	return c
}

// SetDocumentation sets the documentation of the config definition.
func (c *ConfigDefinition) SetDocumentation(documentation string) *ConfigDefinition {
	c.Definition.Documentation = documentation
	return c
}

// SetRequired sets whether the config definition is required.
func (c *ConfigDefinition) SetRequired(isRequired bool) *ConfigDefinition {
	c.Definition.Required = isRequired
	return c
}

// SetRecommendedValues sets the recommended values of the config value.
func (c *ConfigDefinition) SetRecommendedValues(recommendedValues []string) *ConfigDefinition {
	c.Value.RecommendedValues = recommendedValues
	return c
}

// ConfigDefinitionValue represents the computed configuration properties that will
// be parsed from JSON.
type ConfigDefinitionValue struct {
	Name              string   `json:"name"`
	Value             any      `json:"value"`
	RecommendedValues []string `json:"recommended_values"`
	Errors            []string `json:"errors"`
	Visible           bool     `json:"visible"`
}

func (c *ConfigDefinitionValue) ToMap() map[string]any {
	return toJSONMapStringAny(c)
}
