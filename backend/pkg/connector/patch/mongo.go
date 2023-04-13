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

// ConfigPatchMongoDB is a config patch that includes changes that shall be applied to the
// MongoDB connectors.
type ConfigPatchMongoDB struct {
	ConfigurationKeySelector IncludeExcludeSelector
	ConnectorClassSelector   IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchMongoDB)(nil)

const (
	mongoClassSelectorRegexp = `com.mongodb.kafka.connect.Mongo(Source|Sink)Connector`
)

// NewConfigPatchMongoDB returns a new Patch for the MongoDB connectors.
func NewConfigPatchMongoDB() *ConfigPatchMongoDB {
	return &ConfigPatchMongoDB{
		ConfigurationKeySelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`.*`),
			Exclude: nil,
		},
		ConnectorClassSelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(mongoClassSelectorRegexp),
			Exclude: nil,
		},
	}
}

// IsMatch implements the ConfigPatch.IsMatch interface.
func (c *ConfigPatchMongoDB) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
func (*ConfigPatchMongoDB) PatchDefinition(d model.ConfigDefinition, connectorClass string) model.ConfigDefinition {
	// Misc patches
	switch d.Definition.Name {
	case "connection.uri":
		d.SetDefaultValue("mongodb://")
	case keyConverter, valueConverter:
		d.SetDefaultValue("org.apache.kafka.connect.json.JsonConverter")
	case "output.schema.infer.value":
		d.SetDocumentation("Infer the schema for the value. Each Document will be processed in isolation, which may lead to multiple schema definitions for the data. Only applied when Kafka message value format is set to AVRO or JSON.")
	case "change.stream.full.document",
		"change.stream.full.document.before.change":
		d.SetComponentType(model.ComponentRadioGroup)
	case "startup.mode":
		d.AddRecommendedValueWithMetadata("latest", "LATEST").
			AddRecommendedValueWithMetadata("timestamp", "TIMESTAMP").
			AddRecommendedValueWithMetadata("copy_existing", "COPY_EXISTING").
			SetComponentType(model.ComponentRadioGroup).
			SetDefaultValue("latest")
	case name:
		d.SetDefaultValue("mongodb-" + extractType(connectorClass, mongoClassSelectorRegexp) + "-connector-" + strings.ToLower(random.String(4)))
	}

	// Importance Patches
	switch d.Definition.Name {
	case "topic.prefix",
		"database",
		"collection",
		"startup.mode":
		d.SetImportance(model.ConfigDefinitionImportanceHigh)
	case "output.schema.key",
		"output.schema.value",
		"change.stream.full.document",
		"change.stream.full.document.before.change",
		"publish.full.document.only",
		"collation":
		d.SetImportance(model.ConfigDefinitionImportanceMedium)
	case "zzz":
		d.SetImportance(model.ConfigDefinitionImportanceLow)
	}

	return d
}
