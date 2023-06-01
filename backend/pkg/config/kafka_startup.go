// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"fmt"
	"math"
	"time"
)

// KafkaStartup is a configuration block to specify how often and with what delays
// we should try to connect to the Kafka service. If all attempts have failed the
// application will exit with code 1.
type KafkaStartup struct {
	// EstablishConnectionEagerly determines whether the Kafka connection should
	// be tested when it is created. This is handy to ensure the Kafka connection
	// is working before issuing any further requests, but it requires some extra
	// latency as requests are sent and awaited.
	EstablishConnectionEagerly bool          `yaml:"establishConnectionEagerly"`
	MaxRetries                 int           `yaml:"maxRetries"`
	RetryInterval              time.Duration `yaml:"retryInterval"`
	MaxRetryInterval           time.Duration `yaml:"maxRetryInterval"`
	BackoffMultiplier          float64       `yaml:"backoffMultiplier"`
}

// SetDefaults for Kafka startup configuration.
func (k *KafkaStartup) SetDefaults() {
	k.EstablishConnectionEagerly = true
	k.MaxRetries = 5
	k.RetryInterval = time.Second
	k.MaxRetryInterval = 60 * time.Second
	k.BackoffMultiplier = 2
}

// Validate startup config.
func (k *KafkaStartup) Validate() error {
	if k.MaxRetries < 0 {
		return fmt.Errorf("max retries must be 0 for unlimited retries or a positive integer")
	}
	if k.MaxRetries == 0 {
		k.MaxRetries = math.MaxInt
	}

	if k.BackoffMultiplier <= 0 {
		return fmt.Errorf("the backoff multiplier must be greater than 0")
	}

	return nil
}
