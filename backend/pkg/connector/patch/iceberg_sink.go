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

// ConfigPatchIcebergSink is a config patch that includes changes that shall be applied to the
// Iceberg sink connector.
type ConfigPatchIcebergSink struct {
	ConfigurationKeySelector IncludeExcludeSelector
	ConnectorClassSelector   IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchIcebergSink)(nil)

// NewConfigPatchIcebergSink returns a new Patch for the Iceberg sink connector.
func NewConfigPatchIcebergSink() *ConfigPatchIcebergSink {
	return &ConfigPatchIcebergSink{
		ConfigurationKeySelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`.*`),
			Exclude: nil,
		},
		ConnectorClassSelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`io.tabular.iceberg.connect.IcebergSinkConnector`),
			Exclude: nil,
		},
	}
}

// IsMatch implements the ConfigPatch.IsMatch interface.
func (c *ConfigPatchIcebergSink) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
func (*ConfigPatchIcebergSink) PatchDefinition(d model.ConfigDefinition, _ string) model.ConfigDefinition {
	// Misc patches
	switch d.Definition.Name {
	case keyConverter:
		d.SetImportance(model.ConfigDefinitionImportanceHigh).
			ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("io.confluent.connect.avro.AvroConverter", "AVRO").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.json.JsonConverter", "JSON").
			SetDefaultValue("org.apache.kafka.connect.json.JsonConverter")
	case valueConverter:
		d.ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("io.confluent.connect.avro.AvroConverter", "AVRO").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.json.JsonConverter", "JSON").
			SetDefaultValue("org.apache.kafka.connect.json.JsonConverter")
	case name:
		d.SetDefaultValue("iceberg-sink-connector-" + strings.ToLower(random.String(4)))
	case "iceberg.control.commit.interval-ms":
		d.SetDisplayName("Iceberg commit interval ms")
	case "iceberg.control.commit.threads":
		d.SetDisplayName("Iceberg commit threads")
	case "iceberg.control.commit.timeout-ms":
		d.SetDisplayName("Iceberg commit timeout ms")
	case "iceberg.tables.upsert-mode-enabled":
		d.SetDisplayName("Iceberg tables upsert mode enabled")
	case "iceberg.control.topic":
		d.SetImportance(model.ConfigDefinitionImportanceHigh).
			SetDocumentation("Name of the control topic. Control topic has to exist before creating the connector. It has to be unique for each Iceberg connector working in the same cluster").
			SetDefaultValue("iceberg-connector-control-" + strings.ToLower(random.String(4))).
			SetRequired(true)
	}

	return d
}
