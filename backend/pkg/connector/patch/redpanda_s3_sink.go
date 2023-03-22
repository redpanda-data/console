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

// ConfigPatchRedpandaS3 is a config patch that includes changes that shall be applied to the
// Redpanda S3 Sink connector.
type ConfigPatchRedpandaS3 struct {
	ConfigurationKeySelector IncludeExcludeSelector
	ConnectorClassSelector   IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchRedpandaS3)(nil)

// NewConfigPatchRedpandaS3 returns a new Patch for the Redpanda S3 connector.
func NewConfigPatchRedpandaS3() *ConfigPatchRedpandaS3 {
	return &ConfigPatchRedpandaS3{
		ConfigurationKeySelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`.*`),
			Exclude: nil,
		},
		ConnectorClassSelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`com.redpanda.kafka.connect.s3\..*`),
			Exclude: nil,
		},
	}
}

// IsMatch implements the ConfigPatch.IsMatch interface.
func (c *ConfigPatchRedpandaS3) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
//
//nolint:cyclop // This function defines/patches a lot of things, but it's easy to comprehend.
func (*ConfigPatchRedpandaS3) PatchDefinition(d model.ConfigDefinition) model.ConfigDefinition {
	// Misc patches
	switch d.Definition.Name {
	case "format.output.type":
		d.SetDisplayName("S3 file format").
			SetDocumentation("Format of the key coming from the Kafka topic. A valid schema must be available.").
			SetComponentType(model.ComponentRadioGroup)
	case "file.compression.type":
		d.SetDisplayName("Output file compression").
			SetComponentType(model.ComponentRadioGroup)
	case "format.output.fields":
		d.SetDisplayName("Output fields").
			SetComponentType(model.ComponentRadioGroup)
	case "format.output.fields.value.encoding":
		d.SetDisplayName("Value field encoding").
			SetComponentType(model.ComponentRadioGroup)
	case "format.output.envelope":
		d.SetDisplayName("Envelope for primitives")
	case "file.max.records":
		d.SetDisplayName("Max records per file")
	case "aws.access.key.id":
		d.SetRequired(true)
		d.SetDocumentation("")
	case "aws.secret.access.key":
		d.SetRequired(true)
		d.SetDocumentation("")
	case "aws.s3.bucket.name":
		d.SetDocumentation("")
	case "aws.s3.region":
		d.SetRecommendedValues(awsRegions)
		d.SetDocumentation("")
	case "name":
		d.SetValue("s3-connector")

	// Below properties will be grouped into "Error Handling"
	case "errors.retry.timeout":
		d.SetDisplayName("Retry timeout")
	case "kafka.retry.backoff.ms":
		d.SetDisplayName("Retry back-off").
			SetDocumentation("Retry backoff in milliseconds. Useful for performing recovery in case " +
				"of transient exceptions. Maximum value is 86400000 (24 hours).")
	case "aws.s3.backoff.max.delay.ms":
		d.SetDisplayName("S3 maximum back-off")
	case "aws.s3.backoff.max.retries":
		d.SetDisplayName("S3 max retries")
	case "aws.s3.backoff.delay.ms":
		d.SetDisplayName("S3 retry back-off")
	}

	// Importance Patches
	switch d.Definition.Name {
	case "aws.access.key.id",
		"aws.secret.access.key",
		"aws.s3.bucket.name",
		"aws.s3.region",
		"format.output.type":
		d.SetImportance(model.ConfigDefinitionImportanceHigh)
	case "aws.sts.role.arn",
		"aws.sts.role.session.name",
		"aws.sts.role.external.id",
		"aws.sts.role.session.duration",
		"aws.sts.config.endpoint",
		"config.action.reload":
		d.SetImportance(model.ConfigDefinitionImportanceLow)
	}

	return d
}
