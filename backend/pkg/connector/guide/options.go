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
	"github.com/cloudhut/connect-client"

	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

// KafkaConnectToConsoleHook is a function that lets you modify the validation response
// before it is sent to the Console frontend.
type KafkaConnectToConsoleHook = func(
	connectorsValidationResponse connect.ConnectorValidationResult,
	result model.ValidationResponse) model.ValidationResponse

// ConsoleToKafkaConnectHook is a function that lets you modify the configuration key/value
// pairs before they are sent from Console to Kafka Connect.
type ConsoleToKafkaConnectHook = func(map[string]any) map[string]any

// Options for connector guides.
type Options struct {
	injectedValues []injectedValue

	consoleToKafkaConnectHookFn ConsoleToKafkaConnectHook
	kafkaConnectToConsoleHookFn KafkaConnectToConsoleHook
}

type injectedValue struct {
	Key             string
	Value           string
	IsAuthoritative bool
}

// Option implements the functional options pattern for Options.
type Option = func(*Options)

// WithInjectedValues instruct the guide to include the key value pairs to the connector
// configuration when validating and submitting the connector configuration. Set isAuthoritative
// to true to overwrite user provided configurations for the respective config keys.
func WithInjectedValues(keyVals map[string]string, isAuthoritative bool) Option {
	injectedValues := make([]injectedValue, 0, len(keyVals))
	for key, val := range keyVals {
		injectedValues = append(injectedValues, injectedValue{
			Key:             key,
			Value:           val,
			IsAuthoritative: isAuthoritative,
		})
	}

	return func(o *Options) {
		o.injectedValues = injectedValues
	}
}

// WithConsoleToKafkaConnectHookFn lets you pass a hook which can modify or extend the connector
// configurations before they will be sent to Kafka connect. The hook is executed at the end
// of
func WithConsoleToKafkaConnectHookFn(fn ConsoleToKafkaConnectHook) Option {
	return func(o *Options) {
		o.consoleToKafkaConnectHookFn = fn
	}
}

// WithKafkaConnectToConsoleHookFn lets you pass a hook which can modify the connector's validation
// results before they are sent to the Console frontend. This hook will be called at the end
// of the Guide's KafkaConnectToConsole func, thus it may have done certain modifications already.
func WithKafkaConnectToConsoleHookFn(fn KafkaConnectToConsoleHook) Option {
	return func(o *Options) {
		o.kafkaConnectToConsoleHookFn = fn
	}
}
