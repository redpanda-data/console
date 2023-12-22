// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package topic

import (
	"github.com/twmb/franz-go/pkg/kmsg"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

type kafkaClientMapper struct{}

// createTopicRequestToKafka maps the proto request to create a topic into a kmsg.CreateTopicsRequestTopic.
func (k *kafkaClientMapper) createTopicRequestToKafka(req *v1alpha1.CreateTopicRequest) *kmsg.CreateTopicsRequest {
	kafkaReq := kmsg.NewCreateTopicsRequest()
	kafkaReq.ValidateOnly = req.ValidateOnly
	kafkaReq.Topics = []kmsg.CreateTopicsRequestTopic{k.createTopicRequestTopicToKafka(req.Topic)}
	return &kafkaReq
}

// createTopicRequestToKafka maps the proto message for creating a topic to kmsg.CreateTopicsRequestTopic.
func (*kafkaClientMapper) createTopicRequestTopicToKafka(topicReq *v1alpha1.CreateTopicRequest_Topic) kmsg.CreateTopicsRequestTopic {
	partitionCount := int32(-1)
	if topicReq.PartitionCount != nil {
		partitionCount = *topicReq.PartitionCount
	}

	replicationFactor := int16(-1)
	if topicReq.ReplicationFactor != nil {
		replicationFactor = int16(*topicReq.ReplicationFactor)
	}

	configs := make([]kmsg.CreateTopicsRequestTopicConfig, len(topicReq.Configs))
	for i, cfg := range topicReq.Configs {
		c := kmsg.NewCreateTopicsRequestTopicConfig()
		c.Name = cfg.Name
		c.Value = cfg.Value
		configs[i] = c
	}

	replicaAssignments := make([]kmsg.CreateTopicsRequestTopicReplicaAssignment, len(topicReq.ReplicaAssignment))
	for i, assignment := range topicReq.ReplicaAssignment {
		a := kmsg.NewCreateTopicsRequestTopicReplicaAssignment()
		a.Partition = assignment.Partition
		a.Replicas = assignment.Replicas
		replicaAssignments[i] = a
	}

	req := kmsg.NewCreateTopicsRequestTopic()
	req.Topic = topicReq.Name
	req.NumPartitions = partitionCount
	req.ReplicationFactor = replicationFactor
	req.ReplicaAssignment = replicaAssignments
	req.Configs = configs

	return req
}

func (*kafkaClientMapper) createTopicResponseTopicToProto(topic kmsg.CreateTopicsResponseTopic) *v1alpha1.CreateTopicResponse {
	return &v1alpha1.CreateTopicResponse{
		Name: topic.Topic,
	}
}
