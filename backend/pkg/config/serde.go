// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"flag"
	"fmt"
)

// Serde configures all serializers / deserializers that require extra
// configuration.
type Serde struct {
	MaxDeserializationPayloadSize int     `yaml:"maxDeserializationPayloadSize"`
	Protobuf                      Proto   `yaml:"protobuf"`
	MessagePack                   Msgpack `yaml:"messagePack"`
	Cbor                          Cbor    `yaml:"cbor"`
}

// SetDefaults for Serde config
func (c *Serde) SetDefaults() {
	c.MaxDeserializationPayloadSize = DefaultMaxDeserializationPayloadSize
	c.Protobuf.SetDefaults()
	c.MessagePack.SetDefaults()
}

// RegisterFlags registers all nested config flags.
func (c *Serde) RegisterFlags(f *flag.FlagSet) {
	c.Protobuf.RegisterFlags(f)
}

// Validate the Serde config
func (c *Serde) Validate() error {
	if err := c.Protobuf.Validate(); err != nil {
		return fmt.Errorf("failed to validate protobuf config: %w", err)
	}

	if err := c.MessagePack.Validate(); err != nil {
		return fmt.Errorf("failed to validate msgpack config: %w", err)
	}

	if err := c.Cbor.Validate(); err != nil {
		return fmt.Errorf("failed to validate msgpack config: %w", err)
	}

	return nil
}
