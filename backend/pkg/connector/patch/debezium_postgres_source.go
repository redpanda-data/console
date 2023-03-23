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

// ConfigPatchDebeziumPostgresSource is a config patch that includes changes that shall be applied to the
// Debezium Postgres source connectors.
type ConfigPatchDebeziumPostgresSource struct {
	ConfigurationKeySelector IncludeExcludeSelector
	ConnectorClassSelector   IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchDebeziumPostgresSource)(nil)

// NewConfigPatchDebeziumPostgresSource returns a new Patch for the Debezium Postgres source connectors.
func NewConfigPatchDebeziumPostgresSource() *ConfigPatchDebeziumPostgresSource {
	return &ConfigPatchDebeziumPostgresSource{
		ConfigurationKeySelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`.*`),
			Exclude: nil,
		},
		ConnectorClassSelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`io.debezium.connector.postgresql\..*`),
			Exclude: nil,
		},
	}
}

// IsMatch implements the ConfigPatch.IsMatch interface.
func (c *ConfigPatchDebeziumPostgresSource) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
//
//nolint:cyclop // This function defines/patches a lot of things, but it's easy to comprehend.
func (*ConfigPatchDebeziumPostgresSource) PatchDefinition(d model.ConfigDefinition) model.ConfigDefinition {
	// Misc patches
	switch d.Definition.Name {
	case "name":
		d.SetDefaultValue("debezium-postgresql-connector")
	case "plugin.name":
		d.SetDefaultValue("pgoutput")
	case "flush.lsn.source":
		d.SetDefaultValue("true")
	case "tombstones.on.delete":
		d.SetDefaultValue("true")
	case "slot.drop.on.stop":
		d.SetDefaultValue("false")
	case "include.unknown.datatypes":
		d.SetDefaultValue("false")
	case "database.tcpKeepAlive":
		d.SetDefaultValue("true")
	case "table.ignore.builtin":
		d.SetVisible(false)
	case "provide.transaction.metadata":
		d.SetVisible(false)
	// Below properties will be grouped into "Error Handling"
	case "errors.retry.timeout":
		d.SetDisplayName("Retry timeout")
	case "key.converter":
		d.SetDefaultValue("io.confluent.connect.avro.AvroConverter").
			ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("io.confluent.connect.avro.AvroConverter", "AVRO").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.json.JsonConverter", "JSON")
	case "value.converter":
		d.SetDefaultValue("io.confluent.connect.avro.AvroConverter").
			ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("io.confluent.connect.avro.AvroConverter", "AVRO").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.json.JsonConverter", "JSON")
	}

	// Importance Patches
	switch d.Definition.Name {
	case "database.dbname":
		d.SetImportance(model.ConfigDefinitionImportanceHigh)
	case "schema.include.list",
		"schema.exclude.list",
		"database.include.list",
		"database.exclude.list",
		"table.include.list",
		"table.exclude.list",
		"column.include.list",
		"column.exclude.list",
		"money.fraction.digits",
		"topic.creation.enable",
		"topic.creation.default.partitions",
		"topic.creation.default.replication.factor":
		d.SetImportance(model.ConfigDefinitionImportanceMedium)
	}

	return d
}
