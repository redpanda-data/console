// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

// ProtoTopicMapping is the configuration that defines what prototypes shall be used
// for what topics (either key or value), so that we can decode these. This is only relevant
// if the topics have been serialized without the schema registry being involved in the
// serialization.
type ProtoTopicMapping struct {
	// TopicName is the name of the topic to apply these proto files. This supports regex.
	TopicName string `yaml:"topicName"`

	// KeyProtoType is the proto's fully qualified name that shall be used for a Kafka record's key
	KeyProtoType string `yaml:"keyProtoType"`

	// ValueProtoType is the proto's fully qualified name that shall be used for a Kafka record's value
	ValueProtoType string `yaml:"valueProtoType"`
}
