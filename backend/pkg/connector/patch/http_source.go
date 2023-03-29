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

// ConfigPatchHttpSource is a config patch that includes changes that shall be applied to the
// BigQuery source connector.
type ConfigPatchHttpSource struct {
	ConfigurationKeySelector IncludeExcludeSelector
	ConnectorClassSelector   IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchBigQuery)(nil)

// NewConfigPatchHttpSource returns a new Patch for the BigQuery source connector.
func NewConfigPatchHttpSource() *ConfigPatchHttpSource {
	return &ConfigPatchHttpSource{
		ConfigurationKeySelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`.*`),
			Exclude: nil,
		},
		ConnectorClassSelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`com.github.castorm.kafka.connect.http.HttpSourceConnector`),
			Exclude: nil,
		},
	}
}

// IsMatch implements the ConfigPatch.IsMatch interface.
func (c *ConfigPatchHttpSource) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
//
//nolint:cyclop // This function defines/patches a lot of things, but it's easy to comprehend.
func (*ConfigPatchHttpSource) PatchDefinition(d model.ConfigDefinition) model.ConfigDefinition {
	// Misc patches
	switch d.Definition.Name {
	case "key.converter":
		d.ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("io.confluent.connect.avro.AvroConverter", "AVRO").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.json.JsonConverter", "JSON").
			SetDefaultValue("org.apache.kafka.connect.json.JsonConverter")
	case "value.converter":
		d.ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("io.confluent.connect.avro.AvroConverter", "AVRO").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.json.JsonConverter", "JSON").
			SetDefaultValue("org.apache.kafka.connect.json.JsonConverter")
	case "http.auth.type":
		d.AddRecommendedValueWithMetadata("None", "None").
			AddRecommendedValueWithMetadata("Basic", "Basic").
			SetDefaultValue("None")
	case "http.request.method":
		d.AddRecommendedValueWithMetadata("GET", "GET").
			AddRecommendedValueWithMetadata("POST", "POST").
			AddRecommendedValueWithMetadata("HEAD", "HEAD").
			AddRecommendedValueWithMetadata("PUT", "PUT").
			AddRecommendedValueWithMetadata("DELETE", "DELETE").
			AddRecommendedValueWithMetadata("PATCH", "PATCH").
			SetDefaultValue("GET")
	case "name":
		d.SetDefaultValue("http-source-connector-" + strings.ToLower(random.String(4)))
	}

	// Importance Patches
	switch d.Definition.Name {
	case "key.converter":
		d.SetImportance(model.ConfigDefinitionImportanceHigh)
	}

	return d
}
