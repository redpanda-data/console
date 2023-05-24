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
func (*ConfigPatchDebeziumMysqlSource) PatchDefinition(d model.ConfigDefinition, _ string) model.ConfigDefinition {
	// Misc patches
	switch d.Definition.Name {
	case name:
		d.SetDefaultValue("debezium-mysql-connector-" + strings.ToLower(random.String(4)))
	case "database.server.id":
		d.SetVisible(false)
	case "database.include.list":
		d.SetDocumentation("A comma-separated list of regular expressions that match the names of the databases for which to capture changes")
	case tableIncludeList:
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
	case "database.ssl.mode":
		d.SetDocumentation("Specifies whether to use an encrypted connection. 'disabled' specifies the use of an unencrypted connection. 'preferred' establishes an encrypted connection if the server supports secure connections. If the server does not support secure connections, falls back to an unencrypted connection. 'required' establishes an encrypted connection or fails if one cannot be made for any reason").
			SetComponentType(model.ComponentRadioGroup).
			ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("disabled", "disabled").
			AddRecommendedValueWithMetadata("preferred", "preferred").
			AddRecommendedValueWithMetadata("required", "required").
			SetDefaultValue("preferred")
	case "connect.keep.alive":
		d.SetDefaultValue("true")
	// Below properties will be grouped into "Error Handling"
	case errorsRetryTimeout:
		d.SetDisplayName("Retry timeout")
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
	}

	// Importance Patches
	switch d.Definition.Name {
	case tableIncludeList,
		"database.include.list",
		"gtid.source.includes",
		"database.server.id.offset",
		"database.server.id":
		d.SetImportance(model.ConfigDefinitionImportanceMedium)
	}

	return d
}
