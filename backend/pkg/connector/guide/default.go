// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package guide

import (
	"sort"
	"strings"

	"golang.org/x/exp/maps"
	"golang.org/x/exp/slices"

	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

const TOPICS_REGEX_PLACEHOLDER = "__TOPICS_REGEX_PLACEHOLDER"

// DefaultGuide is the guide that is used if we haven't matched a connector-specific
// guide. The default guide groups and sorts the returned config properties on a best-effort
// basis.
type DefaultGuide struct {
	options Options
}

// NewDefaultGuide returns a guide that shall be used by default.
func NewDefaultGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}
	return &DefaultGuide{options: o}
}

// ClassName implements Guide.ClassName().
func (*DefaultGuide) ClassName() string {
	// The class name is used for guide matching, but the default guide is always the fallback guide
	// that is used when no other guides were matched. Hence no class name to be returned.
	return ""
}

// ConsoleToKafkaConnect implements Guide.ConsoleToKafkaConnect.
func (g *DefaultGuide) ConsoleToKafkaConnect(configs map[string]any) map[string]any {
	for _, injectedVal := range g.options.injectedValues {
		if injectedVal.IsAuthoritative {
			// We are allowed to override existing user configs
			configs[injectedVal.Key] = injectedVal.Value
			continue
		}

		// We are not allowed to override existing user configs
		if _, exists := configs[injectedVal.Key]; !exists {
			configs[injectedVal.Key] = injectedVal.Value
		}
	}

	if g.options.consoleToKafkaConnectHookFn != nil {
		configs = g.options.consoleToKafkaConnectHookFn(configs)
	}

	topics := configs["topics"]
	topicsRegex := configs["topics.regex"]
	if (topics == nil || strings.TrimSpace(topics.(string)) == "") &&
		(topicsRegex == nil || strings.TrimSpace(topicsRegex.(string)) == "") {
		configs["topics.regex"] = TOPICS_REGEX_PLACEHOLDER
	}

	return configs
}

// KafkaConnectToConsole implements Guide.KafkaConnectToConsole.
func (g *DefaultGuide) KafkaConnectToConsole(pluginClassName string, patchedConfigs []model.ConfigDefinition, originalConfig map[string]any) model.ValidationResponse {
	// 1. Extract all configs from the response and index them by their config key
	configs := make([]model.ConfigDefinition, len(patchedConfigs))
	configsByGroup := make(map[string][]model.ConfigDefinition)
	for i, configDef := range patchedConfigs {
		if configDef.Definition.Name == "topics.regex" && configDef.Value.Value == TOPICS_REGEX_PLACEHOLDER {
			configDef.Value.Value = ""
		}
		configs[i] = configDef

		group := ""
		if configDef.Definition.Group != nil {
			group = *configDef.Definition.Group
		}
		configsByGroup[group] = append(configsByGroup[group], configDef)
	}

	// 2. Sort grouped configs by their reported order
	for _, groupedDefs := range configsByGroup {
		slices.SortFunc(groupedDefs, func(a, b model.ConfigDefinition) bool {
			return a.Definition.Order < b.Definition.Order
		})
	}

	// 3. Order groups in order to achieve a stable order in the UI.
	// We try to order groups so that the most important configurations for the users show first.
	// The opinionated grouping is determined as follows:
	// - Common group first, then
	// - Groups that have the most important configurations show first, if multiple groups are equal:
	// - Order by group name asc
	importanceScoreByGroupName := make(map[string]int)
	for groupName, configDefs := range configsByGroup {
		importanceScoreByGroupName[groupName] = 0
		if strings.EqualFold(groupName, "common") {
			// Push the common group to the top
			importanceScoreByGroupName[groupName] += 100
		}
		for _, configDef := range configDefs {
			if configDef.Definition.Required || configDef.Definition.Importance == model.ConfigDefinitionImportanceHigh {
				importanceScoreByGroupName[groupName]++
			}
		}
	}
	groupNames := maps.Keys(importanceScoreByGroupName)
	// Sort by groupname asc
	slices.SortFunc(groupNames, func(a, b string) bool {
		return a < b
	})
	// Sort by number of required props
	sort.SliceStable(groupNames, func(a, b int) bool {
		grpNameA := groupNames[a]
		grpNameB := groupNames[b]
		return importanceScoreByGroupName[grpNameA] > importanceScoreByGroupName[grpNameB]
	})

	// 4. Convert all configs that are grouped by their group name into step groups
	stepGroups := make([]model.ValidationResponseStepGroup, 0, len(configsByGroup))
	for _, groupName := range groupNames {
		configDefs := configsByGroup[groupName]
		configKeys := make([]string, len(configDefs))
		for i, configDef := range configDefs {
			configKeys[i] = configDef.Definition.Name
		}

		sg := model.ValidationResponseStepGroup{
			Name:       groupName,
			ConfigKeys: configKeys,
		}
		stepGroups = append(stepGroups, sg)
	}

	validationResponse := model.ValidationResponse{
		Name:    pluginClassName,
		Configs: configs,
		Steps: []model.ValidationResponseStep{
			{
				Name:   "General",
				Groups: stepGroups,
			},
		},
	}

	if g.options.kafkaConnectToConsoleHookFn == nil {
		return validationResponse
	}
	return g.options.kafkaConnectToConsoleHookFn(validationResponse, originalConfig)
}
