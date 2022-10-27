// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

type ProtoTopicMapping struct {
	TopicName string `yaml:"topicName"`

	// KeyProtoType is the proto's fully qualified name that shall be used for a Kafka record's key
	KeyProtoType string `yaml:"keyProtoType"`

	// ValueProtoType is the proto's fully qualified name that shall be used for a Kafka record's value
	ValueProtoType string `yaml:"valueProtoType"`
}
