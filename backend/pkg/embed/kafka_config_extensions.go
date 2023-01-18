// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package embed

import _ "embed"

// ApacheKafkaConfigs embeds a JSON file with Apache Kafka specific configurations
// that provide additional details (such as grouping configs), so that we can use
// that data for a better presentation of the options in the UI.
//
// Information that is returned via the kafka API (e.g. a config property's documentation)
// will be overridden by this file, so that we can apply our own patches.
//
//go:embed kafka/apache_kafka_configs.json
var ApacheKafkaConfigs []byte

// RedpandaConfigs embeds a JSON file with Redpanda specific configurations
// that provide additional details (such as grouping configs), so that we can use
// that data for a better presentation of the options in the UI.
//
// Information that is returned via the kafka API (e.g. a config property's documentation)
// will be overridden by this file, so that we can apply our own patches.
//
//go:embed kafka/redpanda_configs.json
var RedpandaConfigs []byte
