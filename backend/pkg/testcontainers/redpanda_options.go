// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package testcontainers

// redpandaOptions is the sum of all available options to configure the Redpanda testcontainer.
// All configs are made configurable via the functional options pattern.
type redpandaOptions struct {
	KafkaPort       int
	HTTPPort        int
	RedpandaVersion string
}

// RedpandaOption is an option for the redpanda testcontainer
type RedpandaOption func(*redpandaOptions)

// WithContainerKafkaPort sets a specific internal (inside the
// container) and exported port for the Kafka API
func WithContainerKafkaPort(kafkaPort int) RedpandaOption {
	return func(ro *redpandaOptions) {
		ro.KafkaPort = kafkaPort
	}
}

// WithContainerHTTPPort sets a specific internal port for the HTTP
// API.
func WithContainerHTTPPort(httpPort int) RedpandaOption {
	return func(ro *redpandaOptions) {
		ro.HTTPPort = httpPort
	}
}

// WithRedpandaVersion sets a specific redpanda version.
func WithRedpandaVersion(version string) RedpandaOption {
	return func(ro *redpandaOptions) {
		ro.RedpandaVersion = version
	}
}
