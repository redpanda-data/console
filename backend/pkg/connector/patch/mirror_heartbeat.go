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

// ConfigPatchMirrorHeartbeat is a config patch that includes changes that shall be applied to the
// MirrorHeartbeatConnector.
type ConfigPatchMirrorHeartbeat struct {
	ConfigurationKeySelector IncludeExcludeSelector
	ConnectorClassSelector   IncludeExcludeSelector
}

var _ ConfigPatch = (*ConfigPatchMirrorHeartbeat)(nil)

// NewConfigPatchMirrorHeartbeat returns a new Patch for the MirrorHeartbeatConnector.
func NewConfigPatchMirrorHeartbeat() *ConfigPatchMirrorHeartbeat {
	return &ConfigPatchMirrorHeartbeat{
		ConfigurationKeySelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`.*`),
			Exclude: nil,
		},
		ConnectorClassSelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`org.apache.kafka.connect.mirror.MirrorHeartbeatConnector`),
			Exclude: nil,
		},
	}
}

// IsMatch implements the ConfigPatch.IsMatch interface.
func (c *ConfigPatchMirrorHeartbeat) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
func (*ConfigPatchMirrorHeartbeat) PatchDefinition(d model.ConfigDefinition, _ string) model.ConfigDefinition {
	// Misc patches
	switch d.Definition.Name {
	case sourceClusterAlias:
		d.SetDefaultValue("source").
			SetDocumentation("Used to generate heartbeat topic key")
	case "target.cluster.alias":
		d.SetDefaultValue("target").
			SetDocumentation("Used to generate heartbeat topic key")
	case "heartbeats.topic.replication.factor":
		d.SetDefaultValue("-1")
	case name:
		d.SetDefaultValue("mirror-heartbeat-connector-" + strings.ToLower(random.String(4)))
	}

	// Importance Patches
	switch d.Definition.Name {
	case "emit.heartbeats.interval.seconds":
		d.SetImportance(model.ConfigDefinitionImportanceHigh)
	case sourceClusterAlias,
		"target.cluster.alias":
		d.SetImportance(model.ConfigDefinitionImportanceMedium)
	case keyConverter,
		valueConverter,
		headerConverter:
		d.SetImportance(model.ConfigDefinitionImportanceLow)
	}

	return d
}
