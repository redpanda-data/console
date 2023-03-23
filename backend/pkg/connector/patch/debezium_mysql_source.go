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
	"fmt"
	"github.com/redpanda-data/console/backend/pkg/connector/model"
	"math/rand"
	"regexp"
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
	schemaHistoryTopic := fmt.Sprintf("%s%d", "schema-changes.inventory-", rand.Intn(100))

	// Misc patches
	switch d.Definition.Name {
	case "name":
		d.SetDefaultValue("debezium-mysql-connector")
	case "database.allowPublicKeyRetrieval":
		d.SetDefaultValue("true")
	case "schema.history.internal.kafka.topic":
		d.SetDefaultValue(schemaHistoryTopic)
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
	case "connect.timeout.ms",
		"database.allowPublicKeyRetrieval",
		"schema.include.list",
		"schema.exclude.list",
		"database.include.list",
		"database.exclude.list",
		"table.include.list",
		"table.exclude.list",
		"column.include.list",
		"column.exclude.list",
		"topic.creation.enable",
		"topic.creation.default.partitions",
		"topic.creation.default.replication.factor",
		"topic.creation.default.cleanup.policy":
		d.SetImportance(model.ConfigDefinitionImportanceMedium)
	}

	return d
}
