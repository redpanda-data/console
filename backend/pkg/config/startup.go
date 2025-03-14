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

// ServiceStartupAttemptsOptions is a configuration block to specify how often and with what delays
// we should try to connect to a service. If all attempts have failed the
// application will exit with code 1.
type ServiceStartupAttemptsOptions struct {
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

// SetDefaults for service startup configuration.
func (k *ServiceStartupAttemptsOptions) SetDefaults() {
	k.EstablishConnectionEagerly = true
	k.MaxRetries = 5
	k.RetryInterval = time.Second
	k.MaxRetryInterval = 60 * time.Second
	k.BackoffMultiplier = 2
}

// Validate startup config.
func (k *ServiceStartupAttemptsOptions) Validate() error {
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

// TotalMaxTime calculates the maximum duration for all retry attempts.
// It includes a fixed 6-second time for each attempt and the subsequent
// backoff intervals, which increase by BackoffMultiplier (capped at MaxRetryInterval).
func (k *ServiceStartupAttemptsOptions) TotalMaxTime() time.Duration {
	// Assuming each attempt takes 6s before a failure triggers a backoff.
	totalTime := time.Duration(k.MaxRetries) * 6 * time.Second

	// Calculate cumulative backoff delays for all but the final attempt.
	backoff := k.RetryInterval
	for i := 1; i < k.MaxRetries; i++ {
		totalTime += backoff
		next := time.Duration(float64(backoff) * k.BackoffMultiplier)
		if next > k.MaxRetryInterval {
			backoff = k.MaxRetryInterval
		} else {
			backoff = next
		}
	}

	return totalTime
}
