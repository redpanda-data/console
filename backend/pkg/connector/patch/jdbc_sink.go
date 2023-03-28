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
	"strings"

	"github.com/redpanda-data/console/backend/pkg/connector/model"
	"github.com/redpanda-data/console/backend/pkg/random"
)

// ConfigPatchJdbcSink is a config patch that includes changes that shall be applied to the
// BigQuery sink connector.
type ConfigPatchJdbcSink struct {
	ConfigurationKeySelector IncludeExcludeSelector
	ConnectorClassSelector   IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchBigQuery)(nil)

// NewConfigPatchJdbcSink returns a new Patch for the BigQuery sink connector.
func NewConfigPatchJdbcSink() *ConfigPatchJdbcSink {
	return &ConfigPatchJdbcSink{
		ConfigurationKeySelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`.*`),
			Exclude: nil,
		},
		ConnectorClassSelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`com.redpanda.kafka.connect.jdbc.JdbcSinkConnector`),
			Exclude: nil,
		},
	}
}

// IsMatch implements the ConfigPatch.IsMatch interface.
func (c *ConfigPatchJdbcSink) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
//
//nolint:cyclop // This function defines/patches a lot of things, but it's easy to comprehend.
func (*ConfigPatchJdbcSink) PatchDefinition(d model.ConfigDefinition) model.ConfigDefinition {
	// Misc patches
	switch d.Definition.Name {
	case "key.converter":
		d.SetImportance(model.ConfigDefinitionImportanceHigh)
	case "value.converter":
		d.ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("io.confluent.connect.avro.AvroConverter", "AVRO").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.json.JsonConverter", "JSON").
			SetDefaultValue("org.apache.kafka.connect.json.JsonConverter")
	case "insert.mode":
		d.SetDisplayName("Insert Mode").
			SetDocumentation("The insertion mode to use. INSERT - Use standard SQL 'INSERT' statements. MULTI - Use multi-row `INSERT` statements. 'UPSERT' - Use the appropriate upsert semantics for the target database if it is supported by the connector, e.g. 'INSERT .. ON CONFLICT .. DO UPDATE SET ..'. 'UPDATE' - Use the appropriate update semantics for the target database if it is supported by the connector, e.g. 'UPDATE'.").
			SetImportance(model.ConfigDefinitionImportanceMedium).
			SetComponentType(model.ComponentRadioGroup).
			AddRecommendedValueWithMetadata("insert", "INSERT").
			AddRecommendedValueWithMetadata("multi", "MULTI").
			AddRecommendedValueWithMetadata("upsert", "UPSERT").
			AddRecommendedValueWithMetadata("update", "UPDATE").
			SetDefaultValue("insert")
	case "pk.mode":
		d.SetDisplayName("Primary Key Mode").
			SetDocumentation("The primary key mode, also refer to 'Primary Key Fields' documentation for interplay. Supported modes are: 'NONE' - No keys utilized. 'kafka' - Kafka coordinates (the topic, partition, and offset) are used as the PK. 'RECORD_KEY' - Field(s) from the record key are used, which may be a primitive or a struct. 'RECORD_VALUE' - Field(s) from the record value are used, which must be a struct.").
			SetImportance(model.ConfigDefinitionImportanceMedium).
			SetComponentType(model.ComponentRadioGroup).
			AddRecommendedValueWithMetadata("none", "NONE").
			AddRecommendedValueWithMetadata("kafka", "KAFKA").
			AddRecommendedValueWithMetadata("record_key", "RECORD_KEY").
			AddRecommendedValueWithMetadata("record_value", "RECORD_VALUE").
			SetDefaultValue("none")
	case "name":
		d.SetDefaultValue("jdbc-sink-connector-" + strings.ToLower(random.String(4)))
	}

	// Importance Patches
	switch d.Definition.Name {
	case "pk.mode", "insert.mode":
		d.SetImportance(model.ConfigDefinitionImportanceMedium)
	}

	return d
}
