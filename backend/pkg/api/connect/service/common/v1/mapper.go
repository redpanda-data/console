// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package common contains common types and mapping utility functions that are used across
// proto packages in endpoint handlers.
package common

import (
	"fmt"

	"github.com/twmb/franz-go/pkg/kmsg"

	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

// KafkaClientMapper is a utility to map common types between the Kafka Client and the
// proto types that are used for requests and responses.
type KafkaClientMapper struct{}

// ConfigTypeToProto maps the kmsg.ConfigType enum to the proto enum.
func (*KafkaClientMapper) ConfigTypeToProto(configType kmsg.ConfigType) (v1.ConfigType, error) {
	switch configType {
	case kmsg.ConfigTypeBoolean:
		return v1.ConfigType_CONFIG_TYPE_BOOLEAN, nil
	case kmsg.ConfigTypeString:
		return v1.ConfigType_CONFIG_TYPE_STRING, nil
	case kmsg.ConfigTypeInt:
		return v1.ConfigType_CONFIG_TYPE_INT, nil
	case kmsg.ConfigTypeShort:
		return v1.ConfigType_CONFIG_TYPE_SHORT, nil
	case kmsg.ConfigTypeLong:
		return v1.ConfigType_CONFIG_TYPE_LONG, nil
	case kmsg.ConfigTypeDouble:
		return v1.ConfigType_CONFIG_TYPE_DOUBLE, nil
	case kmsg.ConfigTypeList:
		return v1.ConfigType_CONFIG_TYPE_LIST, nil
	case kmsg.ConfigTypeClass:
		return v1.ConfigType_CONFIG_TYPE_CLASS, nil
	case kmsg.ConfigTypePassword:
		return v1.ConfigType_CONFIG_TYPE_PASSWORD, nil
	default:
		return v1.ConfigType_CONFIG_TYPE_UNSPECIFIED, fmt.Errorf("unknown config type %q could not be mapped to proto equivalent", configType.String())
	}
}

// ConfigSourceToProto maps the kmsg.ConfigSource enum to the proto enum.
func (*KafkaClientMapper) ConfigSourceToProto(sourceType kmsg.ConfigSource) (v1.ConfigSource, error) {
	switch sourceType {
	case kmsg.ConfigSourceDynamicTopicConfig:
		return v1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG, nil
	case kmsg.ConfigSourceDynamicBrokerConfig:
		return v1.ConfigSource_CONFIG_SOURCE_DYNAMIC_BROKER_CONFIG, nil
	case kmsg.ConfigSourceDynamicDefaultBrokerConfig:
		return v1.ConfigSource_CONFIG_SOURCE_DYNAMIC_DEFAULT_BROKER_CONFIG, nil
	case kmsg.ConfigSourceStaticBrokerConfig:
		return v1.ConfigSource_CONFIG_SOURCE_STATIC_BROKER_CONFIG, nil
	case kmsg.ConfigSourceDefaultConfig:
		return v1.ConfigSource_CONFIG_SOURCE_DEFAULT_CONFIG, nil
	case kmsg.ConfigSourceDynamicBrokerLoggerConfig:
		return v1.ConfigSource_CONFIG_SOURCE_DYNAMIC_BROKER_LOGGER_CONFIG, nil
	default:
		return v1.ConfigSource_CONFIG_SOURCE_UNSPECIFIED, fmt.Errorf("unknown config source %q could not be mapped to proto", sourceType.String())
	}
}

// ConfigSynonymToProto maps the Kafka client's ConfigSynonym type to the proto equivalent.
func (k *KafkaClientMapper) ConfigSynonymToProto(synonym kmsg.DescribeConfigsResponseResourceConfigConfigSynonym) (*v1.ConfigSynonym, error) {
	configSource, err := k.ConfigSourceToProto(synonym.Source)
	if err != nil {
		return nil, err
	}

	return &v1.ConfigSynonym{
		Name:   synonym.Name,
		Value:  synonym.Value,
		Source: configSource,
	}, nil
}

// AlterConfigOperationToKafka maps the proto enum for altering configurations to the kafka client equivalent.
func (*KafkaClientMapper) AlterConfigOperationToKafka(op v1.ConfigAlterOperation) (kmsg.IncrementalAlterConfigOp, error) {
	switch op {
	case v1.ConfigAlterOperation_CONFIG_ALTER_OPERATION_SET:
		return kmsg.IncrementalAlterConfigOpSet, nil
	case v1.ConfigAlterOperation_CONFIG_ALTER_OPERATION_DELETE:
		return kmsg.IncrementalAlterConfigOpDelete, nil
	case v1.ConfigAlterOperation_CONFIG_ALTER_OPERATION_APPEND:
		return kmsg.IncrementalAlterConfigOpAppend, nil
	case v1.ConfigAlterOperation_CONFIG_ALTER_OPERATION_SUBTRACT:
		return kmsg.IncrementalAlterConfigOpSubtract, nil
	default:
		return -1, fmt.Errorf("unknown incremental alter operation %q could not be mapped to kafka client type", op.String())
	}
}
