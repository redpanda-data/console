// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"encoding/json"
	"fmt"

	"github.com/redpanda-data/console/backend/pkg/embed"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// ConfigEntryExtension are additional documenting properties that
// are defined in Console. These extra properties help the Frontend to provide a better
// UX for editing topic & broker configs. The data for these properties are defined
// in Console and are not accessible via the Kafka API.
// All properties relate to a single config entry such as (retention.ms).
type ConfigEntryExtension struct {
	// Documentation is a descriptive text that explains the given configuration.
	// While this may already be returned via the Kafka API, we use these fields
	// as fallback options in case we are talking to clusters who do not yet
	// support this API.
	Documentation *string `json:"documentation"`

	// Type may be INT, LONG, STRING, BOOLEAN etc. and specifies the technical
	// type of the value.
	// While this may already be returned via the Kafka API, we use these fields
	// as fallback options in case we are talking to clusters who do not yet
	// support this API.
	Type kmsg.ConfigType `json:"type"`

	// ConfigCategory is the category in which a config entry can be grouped at.
	// One such category may be "Cleanup".
	ConfigCategory string `json:"category,omitempty"`

	// ValueType specifies the semantic type of the value.
	// The type field does not tell us whether an int presents a time duration.
	// The expected value is an interval, ratio, byte size etc.
	// Valid value types are: "BYTE_SIZE", "RATIO", "DURATION"
	ValueType string `json:"valueType,omitempty"`

	// EnumValues is a list of values that shall be rendered as a select menu from
	// which a user can choose. This is for instance handy if you want to present
	// the user the available compression methods for `compression.type`.
	// The presented values may be dependent on the target Kafka cluster version.
	EnumValues []interface{} `json:"enumValues,omitempty"`
}

func loadConfigExtensions() (map[string]ConfigEntryExtension, error) {
	type ConfigEntryExtensionDefinition struct {
		Name    string   `json:"name"`
		Aliases []string `json:"aliases"`
		ConfigEntryExtension
	}

	var rpConfigs []ConfigEntryExtensionDefinition
	err := json.Unmarshal(embed.RedpandaConfigs, &rpConfigs)
	if err != nil {
		return nil, fmt.Errorf("failed to parse redpanda config extensions: %w", err)
	}

	var apacheKafkaConfigs []ConfigEntryExtensionDefinition
	err = json.Unmarshal(embed.ApacheKafkaConfigs, &apacheKafkaConfigs)
	if err != nil {
		return nil, fmt.Errorf("failed to parse apache kafka config extensions: %w", err)
	}

	// Index all config entries by config name
	allConfigs := append(rpConfigs, apacheKafkaConfigs...)
	configsByName := make(map[string]ConfigEntryExtension)
	for _, config := range allConfigs {
		configsByName[config.Name] = config.ConfigEntryExtension
		for _, aliasName := range config.Aliases {
			configsByName[aliasName] = config.ConfigEntryExtension
		}
	}

	return configsByName, nil
}
