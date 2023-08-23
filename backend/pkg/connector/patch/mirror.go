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

// ConfigPatchMirrorSource is a config patch that includes changes that shall be applied to the
// MirrorSourceConnector and MirrorCheckpointConnector.
type ConfigPatchMirrorSource struct {
	ConfigurationKeySelector IncludeExcludeSelector
	ConnectorClassSelector   IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchMirrorSource)(nil)

const (
	mirrorClassSelectorRegexp = `org.apache.kafka.connect.mirror.Mirror(Source|Checkpoint)Connector`
	sourceClusterAlias        = "source.cluster.alias"
)

// NewConfigPatchMirrorSource returns a new Patch for the MirrorSourceConnector and MirrorCheckpointConnector.
func NewConfigPatchMirrorSource() *ConfigPatchMirrorSource {
	return &ConfigPatchMirrorSource{
		ConfigurationKeySelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`.*`),
			Exclude: nil,
		},
		ConnectorClassSelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(mirrorClassSelectorRegexp),
			Exclude: nil,
		},
	}
}

// IsMatch implements the ConfigPatch.IsMatch interface.
func (c *ConfigPatchMirrorSource) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
func (*ConfigPatchMirrorSource) PatchDefinition(d model.ConfigDefinition, connectorClass string) model.ConfigDefinition {
	// Misc patches
	switch d.Definition.Name {
	case headerConverter:
		d.SetDefaultValue("org.apache.kafka.connect.converters.ByteArrayConverter")
	case sourceClusterAlias:
		d.SetDefaultValue("source").
			SetDocumentation("When using DefaultReplicationPolicy, topic names will be prefixed with it")
	case "replication.policy.class":
		d.SetComponentType(model.ComponentRadioGroup).
			SetDocumentation("Class which defines the remote topic naming convention. Use IdentityReplicationPolicy to preserve topic names. DefaultReplicationPolicy prefixes topic with the Source cluster alias").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.mirror.IdentityReplicationPolicy", "IdentityReplicationPolicy").
			AddRecommendedValueWithMetadata("org.apache.kafka.connect.mirror.DefaultReplicationPolicy", "DefaultReplicationPolicy").
			SetDefaultValue("org.apache.kafka.connect.mirror.IdentityReplicationPolicy")
	case "offset-syncs.topic.location":
		d.SetComponentType(model.ComponentRadioGroup).
			AddRecommendedValueWithMetadata("source", "source").
			AddRecommendedValueWithMetadata("target", "target").
			SetDefaultValue("source")
	case "offset-syncs.topic.replication.factor",
		"checkpoints.topic.replication.factor":
		d.SetDefaultValue("-1")
	case "replication.factor":
		d.SetDocumentation("Replication factor for newly created remote topics. Set -1 for cluster default").
			SetDefaultValue("-1")
	case "topics.exclude":
		d.SetDefaultValue(".*[\\-\\.]internal,.*\\.replica,__consumer_offsets,_redpanda_e2e_probe,__redpanda.*,_internal_connectors.*,_schemas")
	case "sync.group.offsets.enabled":
		d.SetDefaultValue("true")
	case name:
		d.SetDefaultValue("mirror-" + extractType(connectorClass, mirrorClassSelectorRegexp) + "-connector-" + strings.ToLower(random.String(4)))
	}

	// Importance Patches
	switch d.Definition.Name {
	case "sync.topic.configs.enabled",
		"sync.topic.acls.enabled":
		d.SetImportance(model.ConfigDefinitionImportanceHigh)
	case sourceClusterAlias,
		"topics.exclude",
		"config.properties.exclude":
		d.SetImportance(model.ConfigDefinitionImportanceMedium)
	case keyConverter,
		valueConverter,
		headerConverter:
		d.SetImportance(model.ConfigDefinitionImportanceLow)
	}

	return d
}
