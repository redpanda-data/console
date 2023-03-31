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

// ConfigPatchDebeziumMysqlSource is a config patch that includes changes that shall be applied to the
// Debezium Mysql source connectors.
type ConfigPatchDebeziumMysqlSource struct {
	ConfigurationKeySelector IncludeExcludeSelector
	ConnectorClassSelector   IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchDebeziumMysqlSource)(nil)

// NewConfigPatchDebeziumMysqlSource returns a new Patch for the Debezium Mysql source connectors.
func NewConfigPatchDebeziumMysqlSource() *ConfigPatchDebeziumMysqlSource {
	return &ConfigPatchDebeziumMysqlSource{
		ConfigurationKeySelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`.*`),
			Exclude: nil,
		},
		ConnectorClassSelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`io.debezium.connector.mysql\..*`),
			Exclude: nil,
		},
	}
}

// IsMatch implements the ConfigPatch.IsMatch interface.
func (c *ConfigPatchDebeziumMysqlSource) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
//
//nolint:cyclop // This function defines/patches a lot of things, but it's easy to comprehend.
func (*ConfigPatchDebeziumMysqlSource) PatchDefinition(d model.ConfigDefinition) model.ConfigDefinition {
	// Misc patches
	switch d.Definition.Name {
	case "name":
		d.SetDefaultValue("debezium-mysql-connector-" + strings.ToLower(random.String(4)))
	case "database.server.id":
		d.SetVisible(false)
	case "database.include.list":
		d.SetDocumentation("A comma-separated list of regular expressions that match the names of the databases for which to capture changes")
	case "table.include.list":
		d.SetDocumentation("A comma-separated list of regular expressions that match fully-qualified table identifiers of tables whose changes are to be captured")
	case "column.include.list":
		d.SetDocumentation("A comma-separated list of regular expressions matching fully-qualified names of columns to include in change events")
	case "column.exclude.list":
		d.SetDocumentation("A comma-separated list of regular expressions matching fully-qualified names of columns to exclude from change events")
	case "database.allowPublicKeyRetrieval",
		"include.schema.changes",
		"tombstones.on.delete",
		"enable.time.adjuster",
		"table.ignore.builtin",
		"gtid.source.filter.dml.events":
		d.SetDefaultValue("true")
	case "connect.keep.alive":
		d.SetDefaultValue("true")
	// Below properties will be grouped into "Error Handling"
	case "errors.retry.timeout":
		d.SetDisplayName("Retry timeout")
	case "key.converter":
		d.SetDefaultValue("org.apache.kafka.connect.json.JsonConverter").
			ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("io.confluent.connect.avro.AvroConverter", "AVRO").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.json.JsonConverter", "JSON")
	case "value.converter":
		d.SetDefaultValue("org.apache.kafka.connect.json.JsonConverter").
			ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("io.confluent.connect.avro.AvroConverter", "AVRO").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.json.JsonConverter", "JSON")
	}

	// Importance Patches
	switch d.Definition.Name {
	case "table.include.list",
		"database.include.list",
		"gtid.source.includes",
		"database.server.id.offset",
		"database.server.id":
		d.SetImportance(model.ConfigDefinitionImportanceMedium)
	}

	return d
}
