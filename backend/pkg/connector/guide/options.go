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

// KafkaConnectToConsoleHook is a function that lets you modify the connector config
// before it is sent to the Console frontend.
type KafkaConnectToConsoleHook = func(config map[string]string) map[string]string

// KafkaConnectValidateToConsoleHook is a function that lets you modify the validation response
// before it is sent to the Console frontend.
type KafkaConnectValidateToConsoleHook = func(result model.ValidationResponse, config map[string]any) model.ValidationResponse

// ConsoleToKafkaConnectHook is a function that lets you modify the configuration key/value
// pairs before they are sent from Console to Kafka Connect.
type ConsoleToKafkaConnectHook = func(map[string]any) map[string]any

// Options for connector guides.
type Options struct {
	injectedValues map[string]injectedValue

	consoleToKafkaConnectHookFn         ConsoleToKafkaConnectHook
	kafkaConnectValidateToConsoleHookFn KafkaConnectValidateToConsoleHook
	kafkaConnectToConsoleHookFn         KafkaConnectToConsoleHook
}

type injectedValue struct {
	Value           string
	IsAuthoritative bool
}

// Option implements the functional options pattern for Options.
type Option = func(*Options)

// WithInjectedValues instruct the guide to include the key value pairs to the connector
// configuration when validating and submitting the connector configuration. Set isAuthoritative
// to true to overwrite user provided configurations for the respective config keys.
func WithInjectedValues(keyVals map[string]string, isAuthoritative bool) Option {
	injectedValues := make(map[string]injectedValue, len(keyVals))
	for key, val := range keyVals {
		injectedValues[key] = injectedValue{
			Value:           val,
			IsAuthoritative: isAuthoritative,
		}
	}

	return func(o *Options) {
		o.injectedValues = injectedValues
	}
}

// WithConsoleToKafkaConnectHookFn lets you pass a hook which can modify or extend the connector
// configurations before they will be sent to Kafka connect, e.g. inject configuration.
func WithConsoleToKafkaConnectHookFn(fn ConsoleToKafkaConnectHook) Option {
	return func(o *Options) {
		if o.consoleToKafkaConnectHookFn != nil {
			previousHook := o.consoleToKafkaConnectHookFn
			o.consoleToKafkaConnectHookFn = func(config map[string]any) map[string]any {
				return fn(previousHook(config))
			}
		} else {
			o.consoleToKafkaConnectHookFn = fn
		}
	}
}

// WithKafkaConnectValidateToConsoleHookFn lets you pass a hook which can modify the connector's validation
// results before they are sent to the Console frontend. This hook will be called at the end
// of the Guide's KafkaConnectValidateToConsole func, thus it may have done certain modifications already.
// The method can be called multiple times, the hook is chained with any other previously given hooks.
// It allows to reuse hooks for different connector types and compose desired behaviour from them.
func WithKafkaConnectValidateToConsoleHookFn(fn KafkaConnectValidateToConsoleHook) Option {
	return func(o *Options) {
		if o.kafkaConnectValidateToConsoleHookFn != nil {
			previousHook := o.kafkaConnectValidateToConsoleHookFn
			o.kafkaConnectValidateToConsoleHookFn = func(result model.ValidationResponse, config map[string]any) model.ValidationResponse {
				return fn(previousHook(result, config), config)
			}
		} else {
			o.kafkaConnectValidateToConsoleHookFn = fn
		}
	}
}

// WithKafkaConnectToConsoleHookFn lets you pass a hook which can modify the connector's config
// before it is sent to the Console frontend, e.g. to strip configuration injected bo the Console.
// The method can be called multiple times, the hook is chained with any other previously given hooks.
// It allows to reuse hooks for different connector types and compose desired behaviour from them.
func WithKafkaConnectToConsoleHookFn(fn KafkaConnectToConsoleHook) Option {
	return func(o *Options) {
		if o.kafkaConnectToConsoleHookFn != nil {
			previousHook := o.kafkaConnectToConsoleHookFn
			o.kafkaConnectToConsoleHookFn = func(config map[string]string) map[string]string {
				return fn(previousHook(config))
			}
		} else {
			o.kafkaConnectToConsoleHookFn = fn
		}
	}
}
