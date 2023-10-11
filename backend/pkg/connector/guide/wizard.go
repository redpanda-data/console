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
	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

// WizardGuide implements Guide. It acts as the base for creating connector guides which group
// configuration options into steps & sections. All configurations that are not explicitly
// listed in the wizard steps will be excluded.
type WizardGuide struct {
	DefaultGuide
	// className is the connector class/plugin name. This must match what we retrieve from
	// the Kafka connect cluster, so that this guide is applied.
	className string

	// wizardSteps define the setup wizard steps and what config keys should go into each step.
	// Connector config keys that are not listed in any of the steps are ignored and will not
	// be sent to the frontend at all. If there's only one wizard step, no wizard will be rendered.
	// Steps are presented in their order.
	wizardSteps []model.ValidationResponseStep
}

// ClassName implements Guide.ClassName.
func (g *WizardGuide) ClassName() string {
	return g.className
}

// KafkaConnectValidateToConsole implements Guide.KafkaConnectValidateToConsole. It will compute the
// metadata that specifies group hierarchy, ordering, additional documentation etc. based
// on the wizardSteps and return it. All config keys that are not explicitly listed in
// wizardSteps will be removed from the response.
func (g *WizardGuide) KafkaConnectValidateToConsole(pluginClassName string, patchedConfigs []model.ConfigDefinition, originalConfig map[string]any) model.ValidationResponse {
	// 1. Extract all configs from the response and index them by their config key
	configsByKey := make(map[string]model.ConfigDefinition)
	for _, configDef := range patchedConfigs {
		if configDef.Definition.Name == "topics.regex" && configDef.Value.Value == topicsRegexPlaceholder {
			configDef.Value.Value = ""
		}
		configsByKey[configDef.Definition.Name] = configDef
	}

	// 2. Iterate wizard steps & groups to find & extract config definitions we want to show
	configs := make([]model.ConfigDefinition, 0, len(configsByKey))
	for _, step := range g.wizardSteps {
		for _, group := range step.Groups {
			for _, key := range group.ConfigKeys {
				configDef, exists := configsByKey[key]
				if !exists {
					// We will miss config keys
					continue
				}
				configs = append(configs, configDef)
			}
		}
	}

	validationResponse := model.ValidationResponse{
		Name:    pluginClassName,
		Configs: configs,
		Steps:   g.wizardSteps,
	}
	if g.options.kafkaConnectValidateToConsoleHookFn == nil {
		return validationResponse
	}
	return g.options.kafkaConnectValidateToConsoleHookFn(validationResponse, originalConfig)
}
