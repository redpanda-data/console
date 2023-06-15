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

// ConfigPatchHTTPSource is a config patch that includes changes that shall be applied to the
// BigQuery source connector.
type ConfigPatchHTTPSource struct {
	ConfigurationKeySelector IncludeExcludeSelector
	ConnectorClassSelector   IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchBigQuery)(nil)

// NewConfigPatchHTTPSource returns a new Patch for the BigQuery source connector.
func NewConfigPatchHTTPSource() *ConfigPatchHTTPSource {
	return &ConfigPatchHTTPSource{
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
func (c *ConfigPatchHTTPSource) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
func (*ConfigPatchHTTPSource) PatchDefinition(d model.ConfigDefinition, _ string) model.ConfigDefinition {
	// Misc patches
	switch d.Definition.Name {
	case keyConverter:
		d.ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("io.confluent.connect.avro.AvroConverter", "AVRO").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.json.JsonConverter", "JSON").
			SetDefaultValue("org.apache.kafka.connect.json.JsonConverter")
	case valueConverter:
		d.ClearRecommendedValuesWithMetadata().
			AddRecommendedValueWithMetadata("io.confluent.connect.avro.AvroConverter", "AVRO").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.json.JsonConverter", "JSON").
			SetDefaultValue("org.apache.kafka.connect.json.JsonConverter")
	case "http.timer":
		d.SetComponentType(model.ComponentRadioGroup).
			SetDocumentation("Controls the rate at which HTTP requests are performed by informing the task, how long until the next execution is due").
			AddRecommendedValueWithMetadata("com.github.castorm.kafka.connect.timer.AdaptableIntervalTimer", "AdaptableIntervalTimer").
			AddRecommendedValueWithMetadata("com.github.castorm.kafka.connect.timer.FixedIntervalTimer", "FixedIntervalTimer").
			SetDefaultValue("com.github.castorm.kafka.connect.timer.AdaptableIntervalTimer").
			SetDisplayName("HTTP timer")
	case "http.response.parser":
		d.SetComponentType(model.ComponentRadioGroup).
			SetDocumentation("A class translating HTTP response into the list of SourceRecords expected by Kafka Connect").
			SetDisplayName("HTTP response parser").
			AddRecommendedValueWithMetadata("com.github.castorm.kafka.connect.http.response.PolicyHttpResponseParser", "PolicyHttpResponseParser").
			AddRecommendedValueWithMetadata("com.github.castorm.kafka.connect.http.response.KvHttpResponseParser", "KvHttpResponseParser").
			SetDefaultValue("com.github.castorm.kafka.connect.http.response.PolicyHttpResponseParser")
	case "http.offset.initial":
		d.SetDisplayName("HTTP initial offset").
			SetDocumentation("Initial offset, comma separated list of pairs, example: 'property1=value1,property2=value2'. It is used to define where connector should start reading data from")
	case name:
		d.SetDefaultValue("http-source-connector-" + strings.ToLower(random.String(4)))
	}

	// Importance Patches
	switch d.Definition.Name {
	case keyConverter:
		d.SetImportance(model.ConfigDefinitionImportanceHigh)
	case "http.offset.initial", "http.timer", "http.response.parser":
		d.SetImportance(model.ConfigDefinitionImportanceMedium)
	}

	return d
}
