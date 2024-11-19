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

// ConfigPatchDebeziumSQLServerSource is a config patch that includes changes that shall be applied to the
// Debezium SQL Server source connectors.
type ConfigPatchDebeziumSQLServerSource struct {
	ConfigurationKeySelector IncludeExcludeSelector
	ConnectorClassSelector   IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchDebeziumSQLServerSource)(nil)

// NewConfigPatchDebeziumSQLServerSource returns a new Patch for the Debezium SQL Server source connectors.
func NewConfigPatchDebeziumSQLServerSource() *ConfigPatchDebeziumSQLServerSource {
	return &ConfigPatchDebeziumSQLServerSource{
		ConfigurationKeySelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`.*`),
			Exclude: nil,
		},
		ConnectorClassSelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`io.debezium.connector.sqlserver\..*`),
			Exclude: nil,
		},
	}
}

// IsMatch implements the ConfigPatch.IsMatch interface.
func (c *ConfigPatchDebeziumSQLServerSource) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
func (*ConfigPatchDebeziumSQLServerSource) PatchDefinition(d model.ConfigDefinition, _ string) model.ConfigDefinition {
	// Misc patches
	switch d.Definition.Name {
	case name:
		d.SetDefaultValue("debezium-sqlserver-connector-" + strings.ToLower(random.String(4)))
	case "tasks.max":
		d.SetDocumentation("Specifies the maximum number of tasks that the connector can use to capture data from the database instance. If the `database.names` list contains more than one element, you can increase the value of this property to a number less than or equal to the number of elements in the list")
	case keyConverter:
		d.SetDefaultValue("org.apache.kafka.connect.json.JsonConverter").
			ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("io.confluent.connect.avro.AvroConverter", "AVRO").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.json.JsonConverter", "JSON").
			AddRecommendedValueWithMetadata("io.debezium.converters.CloudEventsConverter", "CloudEvents")
	case valueConverter:
		d.SetDefaultValue("org.apache.kafka.connect.json.JsonConverter").
			ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("io.confluent.connect.avro.AvroConverter", "AVRO").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.json.JsonConverter", "JSON").
			AddRecommendedValueWithMetadata("io.debezium.converters.CloudEventsConverter", "CloudEvents")
	case "transaction.boundary.interval.ms":
		d.SetDefaultValue("1000")
	case "snapshot.fetch.size":
		d.SetDefaultValue("2000")
	case "tombstones.on.delete",
		"table.ignore.builtin":
		d.SetDefaultValue("true")
	}

	// Importance Patches
	switch d.Definition.Name {
	case "notification.sink.topic.name", "table.include.list":
		d.SetImportance(model.ConfigDefinitionImportanceMedium)
	}
	return d
}
