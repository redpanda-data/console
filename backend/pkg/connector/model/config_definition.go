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
	Definition ConfigDefinitionKey      `json:"definition"`
	Value      ConfigDefinitionValue    `json:"value"`
	Metadata   ConfigDefinitionMetadata `json:"metadata,omitempty"`
}

// NewConfigDefinitionFromValidationResult creates a ConfigDefinition based on the validation response
// from Kafka connect.
func NewConfigDefinitionFromValidationResult(result connect.ConnectorValidationResultConfig) ConfigDefinition {
	data, _ := json.Marshal(result)

	var configDef ConfigDefinition
	json.Unmarshal(data, &configDef)

	return configDef
}

// ToValidationResult converts the ConfigDefinition to a Kafka connect compatible Validation response.
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

// SetVisible sets the visibility of the config value.
func (c *ConfigDefinition) SetVisible(visible bool) *ConfigDefinition {
	c.Value.Visible = visible
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

// SetDefaultValue sets the custom default value of the config definition.
func (c *ConfigDefinition) SetDefaultValue(value string) *ConfigDefinition {
	c.Definition.CustomDefaultValue = &value
	return c
}

// SetRecommendedValues sets the recommended values of the config value.
func (c *ConfigDefinition) SetRecommendedValues(recommendedValues []string) *ConfigDefinition {
	c.Value.RecommendedValues = recommendedValues
	return c
}

func (c *ConfigDefinition) SetComponentType(componentType ComponentType) *ConfigDefinition {
	c.Metadata.ComponentType = componentType
	return c
}

func (c *ConfigDefinition) ClearRecommendedValuesWithMetadata() *ConfigDefinition {
	c.Metadata.RecommendedValues = make([]RecommendedValueWithMetadata, 0)
	return c
}

func (c *ConfigDefinition) AddRecommendedValueWithMetadata(value, displayName string) *ConfigDefinition {
	c.Metadata.RecommendedValues = append(c.Metadata.RecommendedValues, RecommendedValueWithMetadata{
		Value:       value,
		DisplayName: displayName,
	})
	return c
}

func (c *ConfigDefinition) AddRecommendedValue(value string) *ConfigDefinition {
	c.Value.RecommendedValues = append(c.Value.RecommendedValues, value)
	return c
}

func (c *ConfigDefinition) AddError(error string) *ConfigDefinition {
	c.Value.Errors = append(c.Value.Errors, error)
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

// ToMap converts the struct to a key/value map so that it can be sent to Kafka connect.
func (c *ConfigDefinitionValue) ToMap() map[string]any {
	return toJSONMapStringAny(c)
}
