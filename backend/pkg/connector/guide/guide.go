// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package guide define what configurations in what order and grouping
// should be rendered in the frontend.
package guide

import (
	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

// Guide can modify the connector configuration or the validation response that is sent
// between the Console frontend and the kafka connect cluster. A guide is a tool to
// create a better setup experience in the Console frontend for specific connectors.
type Guide interface {
	// ClassName is the connector plugin class name that this guide is written for.
	ClassName() string

	// ConsoleToKafkaConnect takes the connector configurations (key/value pairs) and
	// before sending these upstream to the Kafka connect cluster, the guide can
	// modify these configs. One such use case would be a guide that wants to inject
	// additional configurations by default (e.g. schema registry configuration).
	ConsoleToKafkaConnect(configs map[string]any) map[string]any

	// KafkaConnectToConsole takes the response from the kafka connect cluster and returns
	// the enriched validation response that is understood by Console.
	//
	// The Console validation response contains additional metadata that allows the frontend
	// to provide the user with more context, such as Documentation links a two-level grouping,
	// opinionated ordering etc.
	KafkaConnectToConsole(pluginClassName string, patchedConfigs []model.ConfigDefinition, originalConfig map[string]any) model.ValidationResponse
}
