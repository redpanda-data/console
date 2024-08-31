// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

// Cbor represents the CBOR config.
type Cbor struct {
	Enabled bool `yaml:"enabled"`

	// TopicName is a name of the topic that should be considered for cbor decoding. This supports regex
	// This defaults to `/.*/`
	TopicName RegexpOrLiteral `yaml:"topicName"`
}

// Validate cbor configuration.
func (*Cbor) Validate() error {
	return nil
}

// SetDefaults for the cbor configuration.
func (*Cbor) SetDefaults() {}
