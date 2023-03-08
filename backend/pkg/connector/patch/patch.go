// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package patches defines strategies how individual configuration definitions
// that are returned by Kafka connect's validation endpoint shall be modified.
// They can be used to change one or more aspects of connector configurations.
package patch

import (
	"regexp"

	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

// ConfigPatch is an interface that can be implemented to patch one or more aspects of
// a configuration that exists in one or more connector configurations. For instance
// the importance for all "ssl."-prefix configuration keys can be lowered to "LOW",
// across all connector plugins that report this configuration.
type ConfigPatch interface {
	// IsMatch determines if the definition and value shall be patched for a given
	// configuration key or connector class.
	IsMatch(configKey, connectorClass string) bool

	// PatchDefinition lets you change the definition.
	PatchDefinition(definition model.ConfigDefinition) model.ConfigDefinition
}

type IncludeExcludeSelector struct {
	Include *regexp.Regexp
	Exclude *regexp.Regexp
}

func (i *IncludeExcludeSelector) IsMatch(s string) bool {
	if i.Exclude != nil && !i.Exclude.MatchString(s) {
		return false
	}
	return i.Include.MatchString(s)
}
