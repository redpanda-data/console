// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package guide

type Options struct {
	injectedValues []injectedValue
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

	return func(c *Options) {
		c.injectedValues = injectedValues
	}
}
