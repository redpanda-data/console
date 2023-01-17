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

	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/embed"
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

	// FrontendFormat specifies the semantic type of the value.
	// The type field does not tell us whether an int presents a time duration.
	// The expected value is an interval, ratio, byte size etc.
	// Valid value types are: "UNKNOWN" (error), "BOOLEAN", "PASSWORD", "STRING", "SELECT", "MULTI_SELECT", "BYTE_SIZE", "RATIO", "DURATION", "DECIMAL", "INTEGER"
	FrontendFormat FrontendFormat `json:"frontendFormat,omitempty"`

	// EnumValues is a list of values that shall be rendered as a select menu from
	// which a user can choose. This is for instance handy if you want to present
	// the user the available compression methods for `compression.type`.
	// The presented values may be dependent on the target Kafka cluster version.
	EnumValues []string `json:"enumValues,omitempty"`
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
	//nolint: gocritic // Opting for better code readability at the cost of few additional kb in memory usage
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

// FrontendFormat is an enum that indicates the frontend what frontend component it should
// render to allow users editing a specific configuration. For instance a FrontendFormatDuration
// component shall be used for `segment.ms`.
type FrontendFormat int8

// Define our accepted frontend formats.
const (
	FrontendFormatUnknown FrontendFormat = iota
	FrontendFormatBoolean
	FrontendFormatPassword
	FrontendFormatString
	FrontendFormatSelect
	FrontendFormatMultiSelect
	FrontendFormatByteSize
	FrontendFormatRatio
	FrontendFormatDuration
	FrontendFormatDecimal
	FrontendFormatInteger
)

// String converts the iota number into a string when marshalling
// the struct that uses the FrontendFormat which is int8 otherwise.
func (f FrontendFormat) String() string {
	switch f {
	default:
		return "UNKNOWN"
	case FrontendFormatBoolean:
		return "BOOLEAN"
	case FrontendFormatPassword:
		return "PASSWORD"
	case FrontendFormatString:
		return "STRING"
	case FrontendFormatSelect:
		return "SELECT"
	case FrontendFormatMultiSelect:
		return "MULTI_SELECT"
	case FrontendFormatByteSize:
		return "BYTE_SIZE"
	case FrontendFormatRatio:
		return "RATIO"
	case FrontendFormatDuration:
		return "DURATION"
	case FrontendFormatDecimal:
		return "DECIMAL"
	case FrontendFormatInteger:
		return "INTEGER"
	}
}

// MarshalText implements encoding.TextMarshaler.
func (f FrontendFormat) MarshalText() (text []byte, err error) {
	return []byte(f.String()), nil
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (f *FrontendFormat) UnmarshalText(text []byte) error {
	v, err := ParseFrontendFormat(string(text))
	*f = v
	return err
}

// ParseFrontendFormat normalizes the input s and returns
// the value represented by the string.
func ParseFrontendFormat(s string) (FrontendFormat, error) {
	switch s {
	case "BOOLEAN":
		return FrontendFormatBoolean, nil
	case "PASSWORD":
		return FrontendFormatPassword, nil
	case "STRING":
		return FrontendFormatString, nil
	case "SELECT":
		return FrontendFormatSelect, nil
	case "MULTI_SELECT":
		return FrontendFormatMultiSelect, nil
	case "BYTE_SIZE":
		return FrontendFormatByteSize, nil
	case "RATIO":
		return FrontendFormatRatio, nil
	case "DURATION":
		return FrontendFormatDuration, nil
	case "DECIMAL":
		return FrontendFormatDecimal, nil
	case "INTEGER":
		return FrontendFormatInteger, nil
	default:
		return FrontendFormatUnknown, fmt.Errorf("FrontendFormat: unable to parse %q", s)
	}
}

// FrontendFormatFromValueType derives the desired FrontendFormat based on the reported
// Kafka ConfigType.
func FrontendFormatFromValueType(configType kmsg.ConfigType, format FrontendFormat) FrontendFormat {
	if format != FrontendFormatUnknown {
		return format
	}

	// Define all fallback types if we haven't explicitly defined the frontend format
	// that we want to use for a given config.
	switch configType {
	case kmsg.ConfigTypeBoolean:
		return FrontendFormatBoolean
	case kmsg.ConfigTypePassword:
		return FrontendFormatPassword
	case kmsg.ConfigTypeString:
		return FrontendFormatString
	case kmsg.ConfigTypeList, kmsg.ConfigTypeClass:
		// Usually we would return a multi select, but this is only useful if we have declared
		// enum values as part of the config extension definition. If we get to this point
		// we haven't found a defined format and thus likely not have enum values either.
		return FrontendFormatString
	case kmsg.ConfigTypeDouble:
		// We may actually want to present this is a ratio (0-100%), but if we get to this place
		// we likely haven't defined this in our definition JSON, and hence we return a decimal type.
		return FrontendFormatDecimal
	case kmsg.ConfigTypeInt, kmsg.ConfigTypeShort, kmsg.ConfigTypeLong:
		return FrontendFormatInteger
	default:
		return FrontendFormatString
	}
}
