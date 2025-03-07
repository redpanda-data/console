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
	"time"
)

// KafkaConnect defines all configuration options for connecting to one or more
// Kafka KafkaConnect clusters.
type KafkaConnect struct {
	Enabled        bool                  `yaml:"enabled"`
	Clusters       []KafkaConnectCluster `yaml:"clusters"`
	ConnectTimeout time.Duration         `yaml:"connectTimeout"` // used for connectivity test
	ReadTimeout    time.Duration         `yaml:"readTimeout"`    // overall REST/HTTP read timeout
	RequestTimeout time.Duration         `yaml:"requestTimeout"` // timeout for REST requests to Kafka KafkaConnect
}

// SetDefaults for Kafka connect configuration.
func (c *KafkaConnect) SetDefaults() {
	for _, cluster := range c.Clusters {
		cluster.SetDefaults()
	}
	c.ConnectTimeout = 15 * time.Second
	c.ReadTimeout = 6 * time.Second
	c.RequestTimeout = 6 * time.Second
}

// RegisterFlags registers all nested config flags.
func (c *KafkaConnect) RegisterFlags(f *flag.FlagSet) {
	for i, cluster := range c.Clusters {
		flagNamePrefix := fmt.Sprintf("connect.clusters.%d.", i)
		cluster.RegisterFlagsWithPrefix(f, flagNamePrefix)
	}
}

// Validate provided configurations for Kafka connect clusters.
func (c *KafkaConnect) Validate() error {
	for i, cluster := range c.Clusters {
		err := cluster.Validate()
		if err != nil {
			return fmt.Errorf("failed to validate cluster at index '%d' (name: '%v'): %w", i, cluster.Name, err)
		}
	}
	return nil
}
