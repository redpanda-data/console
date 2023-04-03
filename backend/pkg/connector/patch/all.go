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

	"golang.org/x/text/cases"
	"golang.org/x/text/language"

	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

// ConfigPatchAll is a config patch that includes changes that shall be applied to all connector
// configurations across all connectors.
type ConfigPatchAll struct {
	// ConfigurationKeySelector defines what configuration keys (e.g. `tasks.max`) shall be
	// matched. The Config patch will be applied to all configuration keys where the configuration
	// key and connector class selector match.
	ConfigurationKeySelector IncludeExcludeSelector

	// ConnectorClassSelector defines what connector classes
	// (e.g. `org.apache.kafka.connect.mirror.MirrorSourceConnector`) shall be matched.
	// The Config patch will be applied to all configuration keys where the configuration
	// key and connector class selector match.
	ConnectorClassSelector IncludeExcludeSelector

	// CommonAbbreviations is a list of abbreviations that shall be rendered upper-cased,
	// when computing a display name based on a config key that has not set a display name.
	CommonAbbreviations []string

	// Replacers is a map of strings that shall be replaced by another word. Only completed
	// words will be matched. Keys must always be lower-cased.
	Replacers map[string]string
}

var _ ConfigPatch = (*ConfigPatchAll)(nil)

// NewConfigPatchAll returns a ConfigPatch that shall be applied for all connector configurations.
func NewConfigPatchAll() *ConfigPatchAll {
	return &ConfigPatchAll{
		ConfigurationKeySelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(`.*`),
			Exclude: nil,
		},
		ConnectorClassSelector: IncludeExcludeSelector{
			Include: regexp.MustCompile(".*"),
			Exclude: nil,
		},
		CommonAbbreviations: []string{
			"SASL",
			"SSL",
			"ACL",
			"TLS",
			"AWS",
			"S3",
			"STS",
			"ID",
			"ARN",
			"GCP",
			"GCS",
			"KMS",
			"IAM",
			"GSSAPI",
			"JSON",
			"URL",
		},
		Replacers: map[string]string{
			"ms": "milliseconds",
		},
	}
}

// IsMatch implements the ConfigPatch.IsMatch interface.
func (c *ConfigPatchAll) IsMatch(configKey, connectorClass string) bool {
	return c.ConfigurationKeySelector.IsMatch(configKey) && c.ConnectorClassSelector.IsMatch(connectorClass)
}

// PatchDefinition implements the ConfigPatch.PatchDefinition interface.
func (c *ConfigPatchAll) PatchDefinition(d model.ConfigDefinition, _ string) model.ConfigDefinition {
	if d.Definition.DisplayName == "" || d.Definition.DisplayName == d.Definition.Name {
		computedDisplayName := c.configNameToDisplayName(d.Definition.Name)
		d.SetDisplayName(computedDisplayName)
	}

	if d.Definition.Name == "errors.tolerance" {
		d.SetDisplayName("Error tolerance")
	}

	return d
}

// ConfigNameToDisplayName computes a display name by title casing the input key
// and replacing known abbreviations with the correctly formatted abbreviation.
func (c *ConfigPatchAll) configNameToDisplayName(key string) string {
	if key == "" {
		return ""
	}

	title := cases.Title(language.English, cases.NoLower)
	caseWord := func(i string) string {
		result := strings.ToLower(i)
		for _, abbrv := range c.CommonAbbreviations {
			result = strings.ReplaceAll(result, strings.ToLower(abbrv), abbrv)
		}

		if synonym, exists := c.Replacers[result]; exists {
			result = synonym
		}

		return result
	}

	words := strings.Split(key, ".")
	for i, word := range words {
		if i == 0 {
			words[i] = title.String(caseWord(word))
		} else {
			words[i] = caseWord(word)
		}
	}
	return strings.Join(words, " ")
}
