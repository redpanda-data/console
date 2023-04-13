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
func (*ConfigPatchDebeziumPostgresSource) PatchDefinition(d model.ConfigDefinition, _ string) model.ConfigDefinition {
	// Misc patches
	switch d.Definition.Name {
	case name:
		d.SetDefaultValue("debezium-postgresql-connector-" + strings.ToLower(random.String(4)))
	case "schema.exclude.list":
		d.SetVisible(true)
	case "plugin.name":
		d.SetDefaultValue("pgoutput")
	case "flush.lsn.source", "tombstones.on.delete", "database.tcpKeepAlive":
		d.SetDefaultValue("true")
	case "slot.drop.on.stop", "include.unknown.datatypes":
		d.SetDefaultValue("false")
	case "table.ignore.builtin", "provide.transaction.metadata":
		d.SetVisible(false)
	// Below properties will be grouped into "Error Handling"
	case errorsRetryTimeout:
		d.SetDisplayName("Retry timeout")
	case keyConverter:
		d.SetDefaultValue("org.apache.kafka.connect.json.JsonConverter").
			ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("io.confluent.connect.avro.AvroConverter", "AVRO").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.json.JsonConverter", "JSON")
	case valueConverter:
		d.SetDefaultValue("org.apache.kafka.connect.json.JsonConverter").
			ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("io.confluent.connect.avro.AvroConverter", "AVRO").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.json.JsonConverter", "JSON")
	}

	// Importance Patches
	switch d.Definition.Name {
	case "database.dbname":
		d.SetImportance(model.ConfigDefinitionImportanceHigh)
	case "schema.include.list",
		tableIncludeList:
		d.SetImportance(model.ConfigDefinitionImportanceMedium)
	}

	return d
}
