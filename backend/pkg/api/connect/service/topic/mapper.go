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
	"fmt"

	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/api/connect/service/common"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

type kafkaClientMapper struct {
	commonKafkaClientMapper common.KafkaClientMapper
}

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

func (*kafkaClientMapper) describeTopicConfigsToKafka(req *v1alpha1.GetTopicConfigurationsRequest) kmsg.DescribeConfigsRequest {
	configResource := kmsg.NewDescribeConfigsRequestResource()
	configResource.ResourceType = kmsg.ConfigResourceTypeTopic
	configResource.ResourceName = req.TopicName
	configResource.ConfigNames = nil // Requests all configs

	kafkaReq := kmsg.NewDescribeConfigsRequest()
	kafkaReq.IncludeDocumentation = true
	kafkaReq.IncludeSynonyms = true
	kafkaReq.Resources = []kmsg.DescribeConfigsRequestResource{configResource}

	return kafkaReq
}

func (k *kafkaClientMapper) describeTopicConfigsToProto(resources []kmsg.DescribeConfigsResponseResourceConfig) ([]*v1alpha1.Topic_Configuration, error) {
	mappedResources := make([]*v1alpha1.Topic_Configuration, len(resources))
	for i, resource := range resources {
		configType, err := k.commonKafkaClientMapper.ConfigTypeToProto(resource.ConfigType)
		if err != nil {
			return nil, fmt.Errorf("failed to map config type for resource %q: %w", resource.Name, err)
		}

		configSource, err := k.commonKafkaClientMapper.ConfigSourceToProto(resource.Source)
		if err != nil {
			return nil, fmt.Errorf("failed to map config source for resource %q: %w", resource.Name, err)
		}

		synonyms := make([]*v1alpha1.ConfigSynonym, len(resource.ConfigSynonyms))
		for i, synonym := range resource.ConfigSynonyms {
			mappedSynonym, err := k.commonKafkaClientMapper.ConfigSynonymToProto(synonym)
			if err != nil {
				return nil, fmt.Errorf("failed to map config synonym for resource %q: %w", resource.Name, err)
			}
			synonyms[i] = mappedSynonym
		}

		mappedResources[i] = &v1alpha1.Topic_Configuration{
			Name:           resource.Name,
			Type:           configType,
			Value:          resource.Value,
			Source:         configSource,
			IsReadOnly:     resource.ReadOnly,
			IsSensitive:    resource.IsSensitive,
			ConfigSynonyms: synonyms,
			Documentation:  resource.Documentation,
		}
	}

	return mappedResources, nil
}

func (*kafkaClientMapper) deleteTopicToKmsg(req *v1alpha1.DeleteTopicRequest) kmsg.DeleteTopicsRequest {
	kafkaReq := kmsg.NewDeleteTopicsRequest()
	kafkaReq.TopicNames = []string{req.Name}
	kafkaReq.Topics = []kmsg.DeleteTopicsRequestTopic{
		{
			Topic: kmsg.StringPtr(req.Name),
		},
	}

	return kafkaReq
}
