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

// ConfigPatchSnowflake is a config patch that includes changes that shall be applied to the
// Snowflake sink connector.
type ConfigPatchSnowflake struct {
	ConfigurationKeySelector IncludeExcludeSelector
	ConnectorClassSelector   IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchSnowflake)(nil)

// NewConfigPatchSnowflake returns a new Patch for the Snowflake sink connector.
func NewConfigPatchSnowflake() *ConfigPatchSnowflake {
	return &ConfigPatchSnowflake{
		ConfigurationKeySelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`.*`),
			Exclude: nil,
		},
		ConnectorClassSelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`com.snowflake.kafka.connector\..*`),
			Exclude: nil,
		},
	}
}

// IsMatch implements the ConfigPatch.IsMatch interface.
func (c *ConfigPatchSnowflake) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
//
//nolint:cyclop // This function defines/patches a lot of things, but it's easy to comprehend.
func (*ConfigPatchSnowflake) PatchDefinition(d model.ConfigDefinition) model.ConfigDefinition {
	// Misc patches
	switch d.Definition.Name {
	case "snowflake.ingestion.method":
		d.SetRecommendedValues([]string{"snowpipe", "snowpipe_streaming"}).
			SetComponentType(model.ComponentRadioGroup)
	case "value.converter":
		d.ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("com.snowflake.kafka.connector.records.SnowflakeJsonConverter", "SNOWFLAKE_JSON").
			AddRecommendedValueWithMetadata("com.snowflake.kafka.connector.records.SnowflakeAvroConverter", "SNOWFLAKE_AVRO").
			AddRecommendedValueWithMetadata("com.snowflake.kafka.connector.records.SnowflakeAvroConverterWithoutSchemaRegistry", "SNOWFLAKE_AVRO_WITHOUT_SCHEMA_REGISTRY").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.storage.StringConverter", "STRING").
			SetDefaultValue("com.snowflake.kafka.connector.records.SnowflakeJsonConverter")
	case "snowflake.url.name",
		"snowflake.database.name",
		"snowflake.user.name",
		"snowflake.role.name":
		d.SetDocumentation("")
	case "snowflake.private.key":
		d.SetDefaultValue("").
			SetRequired(true)
	case "snowflake.private.key.passphrase":
		d.SetDefaultValue("")
	case "snowflake.schema.name":
		d.SetDefaultValue("PUBLIC")
	case "name":
		d.SetDefaultValue("snowflake-connector")
	}

	// Importance Patches
	switch d.Definition.Name {
	case "snowflake.role.name",
		"snowflake.private.key.passphrase":
		d.SetImportance(model.ConfigDefinitionImportanceHigh)
	case "snowflake.schema.name",
		"snowflake.ingestion.method":
		d.SetImportance(model.ConfigDefinitionImportanceMedium)
	case "key.converter":
		d.SetImportance(model.ConfigDefinitionImportanceLow)
	}

	return d
}
