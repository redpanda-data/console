// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package model

// ComponentType type of component to be used in UI
type ComponentType = string

const (
	// ComponentRadioGroup radio button group component
	ComponentRadioGroup ComponentType = "RADIO_GROUP"
)

// ConfigDefinitionMetadata is a block with extra information that can be processed
// by the Console frontend.
type ConfigDefinitionMetadata struct {
	ComponentType     ComponentType                  `json:"component_type,omitempty"`
	RecommendedValues []RecommendedValueWithMetadata `json:"recommended_values,omitempty"`
}

// RecommendedValueWithMetadata is a list of recommended values along with the respective
// display name that shall be rendered in the frontend.
type RecommendedValueWithMetadata struct {
	Value       string `json:"value"`
	DisplayName string `json:"display_name"`
}

// ToMap converts the struct to a key/value map so that it can be sent to Kafka connect.
func (c *ConfigDefinitionMetadata) ToMap() map[string]any {
	return toJSONMapStringAny(c)
}
