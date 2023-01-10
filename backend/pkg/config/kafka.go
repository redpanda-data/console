// Copyright 2022 Redpanda Data, Inc.
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

// Kafka required for opening a connection to Kafka
type Kafka struct {
	// General
	Brokers  []string `yaml:"brokers"`
	ClientID string   `yaml:"clientId"`
	RackID   string   `yaml:"rackId"`

	// Schema Registry
	Schema      Schema  `yaml:"schemaRegistry"`
	Protobuf    Proto   `yaml:"protobuf"`
	MessagePack Msgpack `yaml:"messagePack"`

	TLS  KafkaTLS  `yaml:"tls"`
	SASL KafkaSASL `yaml:"sasl"`
}

// RegisterFlags registers all nested config flags.
func (c *Kafka) RegisterFlags(f *flag.FlagSet) {
	c.TLS.RegisterFlags(f)
	c.SASL.RegisterFlags(f)
	c.Protobuf.RegisterFlags(f)
	c.Schema.RegisterFlags(f)
}

// Validate the Kafka config
func (c *Kafka) Validate() error {
	if len(c.Brokers) == 0 {
		return fmt.Errorf("you must specify at least one broker to connect to")
	}

	err := c.Schema.Validate()
	if err != nil {
		return err
	}

	err = c.Protobuf.Validate()
	if err != nil {
		return fmt.Errorf("failed to validate protobuf config: %w", err)
	}

	err = c.SASL.Validate()
	if err != nil {
		return fmt.Errorf("failed to validate sasl config: %w", err)
	}

	err = c.MessagePack.Validate()
	if err != nil {
		return fmt.Errorf("failed to validate msgpack config: %w", err)
	}

	return nil
}

// SetDefaults for Kafka config
func (c *Kafka) SetDefaults() {
	c.ClientID = "redpanda-console"

	c.SASL.SetDefaults()
	c.Protobuf.SetDefaults()
	c.MessagePack.SetDefaults()
}

// RedactedConfig returns a copy of the config object which redacts sensitive fields. This is useful if you
// want to log the entire config object but without sensitive fields.
func (c Kafka) RedactedConfig() Kafka {
	// In order to not accidentally leak fields from the original config, we copy only
	// known fields into the new config. If we don't do this, we are at risk that someone
	// adds a Config property that is sensitive and not yet redacted.
	copiedCfg := Kafka{}
	copiedCfg.Brokers = c.Brokers
	copiedCfg.ClientID = c.ClientID
	copiedCfg.RackID = c.RackID
	copiedCfg.SASL.Password = redactString(c.SASL.Password)
	copiedCfg.SASL.GSSAPIConfig.Password = redactString(c.SASL.GSSAPIConfig.Password)
	copiedCfg.SASL.OAUth.Token = redactString(c.SASL.OAUth.Token)
	copiedCfg.SASL.AWSMskIam.SecretKey = redactString(c.SASL.AWSMskIam.SecretKey)
	copiedCfg.SASL.AWSMskIam.SessionToken = redactString(c.SASL.AWSMskIam.SessionToken)

	return copiedCfg
}

func redactString(in string) string {
	if in == "" {
		return in
	}
	return "<redacted>"
}
