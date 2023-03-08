// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package interceptor

import (
	"github.com/cloudhut/connect-client"

	"github.com/redpanda-data/console/backend/pkg/connector/guide"
	"github.com/redpanda-data/console/backend/pkg/connector/model"
	"github.com/redpanda-data/console/backend/pkg/connector/patch"
)

// Interceptor intercepts all requests between Console and Kafka connect that
// either validate or create connector configs.
type Interceptor struct {
	configPatches []patch.ConfigPatch

	// defaultGuide is the guide that will be applied if no guide for the given connector
	// class is specified. This guide will convert the connector's validate response to
	// our expected format, but it does not enrich any additional data that benefits the
	// user experience.
	defaultGuide guide.Guide

	// guides is the collection of connector specific guides.
	guides            []guide.Guide
	guidesByClassName map[string]guide.Guide
}

func NewInterceptor(opts ...Option) *Interceptor {
	in := &Interceptor{
		defaultGuide: guide.NewDefaultGuide(),
		configPatches: []patch.ConfigPatch{
			patch.NewConfigPatchAll(),
			patch.NewConfigPatchCommon(),
			patch.NewConfigPatchUpperImportance(),
			patch.NewConfigPatchLowerImportance(),

			patch.NewConfigPatchRedpandaS3(),
		},
		guides: []guide.Guide{
			guide.NewRedpandaAwsS3SinkGuide(),
			guide.NewDebeziumMySQLGuide(),
		},
	}

	for _, opt := range opts {
		opt(in)
	}

	return in
}

// ConsoleToKafkaConnect is called when the user sent a request to Console's /validate
// endpoint. We can modify the payload here before it is sent to the respective
// connect cluster. We need to modify this request if converters were used before,
// as these change the configuration properties that are presented to the frontend.
func (in *Interceptor) ConsoleToKafkaConnect(pluginClassName string, configs map[string]any) map[string]any {
	guide, exists := in.guidesByClassName[pluginClassName]
	if !exists {
		return in.defaultGuide.ConsoleToKafkaConnect(configs)
	}
	return guide.ConsoleToKafkaConnect(configs)
}

// KafkaConnectToConsole is called after we retrieved a connector's validate response from
// the target Kafka connect cluster. We apply modifications based on that response so
// that the configuration properties are presented in a more user-friendly fashion.
func (in *Interceptor) KafkaConnectToConsole(pluginClassName string, response connect.ConnectorValidationResult) model.ValidationResponse {
	// 1. Run all patches on each configuration
	for i, config := range response.Configs {
		configDef := model.NewConfigDefinitionFromValidationResult(config)
		configDef = in.applyConfigPatches(pluginClassName, configDef)
		response.Configs[i] = configDef.ToValidationResult()
	}

	// 2. Apply response patch from guide
	if g, exists := in.guidesByClassName[pluginClassName]; exists {
		return g.KafkaConnectToConsole(response)
	}

	return in.defaultGuide.KafkaConnectToConsole(response)
}

func (in *Interceptor) applyConfigPatches(pluginClassName string, configDefinition model.ConfigDefinition) model.ConfigDefinition {
	for _, patch := range in.configPatches {
		if patch.IsMatch(configDefinition.Definition.Name, pluginClassName) {
			configDefinition = patch.PatchDefinition(configDefinition)
		}
	}

	return configDefinition
}
