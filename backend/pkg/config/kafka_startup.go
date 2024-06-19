// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

// KafkaStartup is a configuration block to specify how often and with what delays
// we should try to connect to the Kafka service. If all attempts have failed the
// application will exit with code 1.
type KafkaStartup struct {
	ServiceStartupAttemptsOptions

	// EstablishConnectionEagerly determines whether the Kafka connection should
	// be tested when it is created. This is handy to ensure the Kafka connection
	// is working before issuing any further requests, but it requires some extra
	// latency as requests are sent and awaited.
	EstablishConnectionEagerly bool `yaml:"establishConnectionEagerly"`
}

// SetDefaults for Kafka startup configuration.
func (k *KafkaStartup) SetDefaults() {
	k.EstablishConnectionEagerly = true

	k.ServiceStartupAttemptsOptions.SetDefaults()
}

// Validate startup config.
func (k *KafkaStartup) Validate() error {
	return k.ServiceStartupAttemptsOptions.Validate()
}
