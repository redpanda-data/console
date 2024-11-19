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

	common "github.com/redpanda-data/console/backend/pkg/api/connect/service/common/v1alpha2"
	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
)

type mapper struct {
	commonKafkaClientMapper common.KafkaClientMapper
}

// createTopicRequestToKafka maps the proto request to create a topic into a kmsg.CreateTopicsRequestTopic.
func (k *mapper) createTopicRequestToKafka(req *v1alpha2.CreateTopicRequest) *kmsg.CreateTopicsRequest {
	kafkaReq := kmsg.NewCreateTopicsRequest()
	kafkaReq.ValidateOnly = req.ValidateOnly
	kafkaReq.Topics = []kmsg.CreateTopicsRequestTopic{k.createTopicRequestTopicToKafka(req.Topic)}
	return &kafkaReq
}

// createTopicRequestToKafka maps the proto message for creating a topic to kmsg.CreateTopicsRequestTopic.
func (*mapper) createTopicRequestTopicToKafka(topicReq *v1alpha2.CreateTopicRequest_Topic) kmsg.CreateTopicsRequestTopic {
	partitionCount := int32(-1)
	if topicReq.PartitionCount != nil {
		partitionCount = *topicReq.PartitionCount
	}

	replicationFactor := int32(-1)
	if topicReq.ReplicationFactor != nil {
		replicationFactor = *topicReq.ReplicationFactor
	}

	configs := make([]kmsg.CreateTopicsRequestTopicConfig, len(topicReq.Configs))
	for i, cfg := range topicReq.Configs {
		c := kmsg.NewCreateTopicsRequestTopicConfig()
		c.Name = cfg.Name
		c.Value = cfg.Value
		configs[i] = c
	}

	replicaAssignments := make([]kmsg.CreateTopicsRequestTopicReplicaAssignment, len(topicReq.ReplicaAssignments))
	for i, assignment := range topicReq.ReplicaAssignments {
		a := kmsg.NewCreateTopicsRequestTopicReplicaAssignment()
		a.Partition = assignment.PartitionId
		a.Replicas = assignment.ReplicaIds
		replicaAssignments[i] = a
	}

	req := kmsg.NewCreateTopicsRequestTopic()
	req.Topic = topicReq.Name
	req.NumPartitions = partitionCount
	req.ReplicationFactor = int16(replicationFactor) // TODO we should change our API to match kafka
	req.ReplicaAssignment = replicaAssignments
	req.Configs = configs

	return req
}

func (*mapper) createTopicResponseTopicToProto(topic kmsg.CreateTopicsResponseTopic) *v1alpha2.CreateTopicResponse {
	return &v1alpha2.CreateTopicResponse{
		Name:              topic.Topic,
		PartitionCount:    topic.NumPartitions,
		ReplicationFactor: int32(topic.ReplicationFactor),
	}
}

func (*mapper) describeTopicConfigsToKafka(req *v1alpha2.GetTopicConfigurationsRequest) kmsg.DescribeConfigsRequest {
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

func (k *mapper) describeTopicConfigsToProto(resources []kmsg.DescribeConfigsResponseResourceConfig) ([]*v1alpha2.Topic_Configuration, error) {
	mappedResources := make([]*v1alpha2.Topic_Configuration, len(resources))
	for i, resource := range resources {
		configType, err := k.commonKafkaClientMapper.ConfigTypeToProto(resource.ConfigType)
		if err != nil {
			return nil, fmt.Errorf("failed to map config type for resource %q: %w", resource.Name, err)
		}

		configSource, err := k.commonKafkaClientMapper.ConfigSourceToProto(resource.Source)
		if err != nil {
			return nil, fmt.Errorf("failed to map config source for resource %q: %w", resource.Name, err)
		}

		synonyms := make([]*v1alpha2.ConfigSynonym, len(resource.ConfigSynonyms))
		for i, synonym := range resource.ConfigSynonyms {
			mappedSynonym, err := k.commonKafkaClientMapper.ConfigSynonymToProto(synonym)
			if err != nil {
				return nil, fmt.Errorf("failed to map config synonym for resource %q: %w", resource.Name, err)
			}
			synonyms[i] = mappedSynonym
		}

		mappedResources[i] = &v1alpha2.Topic_Configuration{
			Name:           resource.Name,
			Type:           configType,
			Value:          resource.Value,
			Source:         configSource,
			ReadOnly:       resource.ReadOnly,
			Sensitive:      resource.IsSensitive,
			ConfigSynonyms: synonyms,
			Documentation:  resource.Documentation,
		}
	}

	return mappedResources, nil
}

func (*mapper) deleteTopicToKmsg(req *v1alpha2.DeleteTopicRequest) kmsg.DeleteTopicsRequest {
	kafkaReq := kmsg.NewDeleteTopicsRequest()
	kafkaReq.TopicNames = []string{req.Name}
	kafkaReq.Topics = []kmsg.DeleteTopicsRequestTopic{
		{
			Topic: kmsg.StringPtr(req.Name),
		},
	}

	return kafkaReq
}

func (k *mapper) updateTopicConfigsToKafka(req *v1alpha2.UpdateTopicConfigurationsRequest) (*kmsg.IncrementalAlterConfigsRequest, error) {
	// We only have one resource (a single topic) whose configs we want to update incrementally
	// The API allows to add many, independent resources of different types. Because we always only
	// want to patch configs for a single Kafka topic, we can simplify the mapping here by hardcoding
	// a couple properties of the request.
	alterTopicResource := kmsg.NewIncrementalAlterConfigsRequestResource()
	alterTopicResource.ResourceType = kmsg.ConfigResourceTypeTopic
	alterTopicResource.ResourceName = req.TopicName

	topicConfigUpdates := make([]kmsg.IncrementalAlterConfigsRequestResourceConfig, len(req.Configurations))
	for i, requestedConfigUpdate := range req.Configurations {
		topicConfigUpdate := kmsg.NewIncrementalAlterConfigsRequestResourceConfig()
		topicConfigUpdate.Name = requestedConfigUpdate.Name
		topicConfigUpdate.Value = requestedConfigUpdate.Value
		kafkaOp, err := k.commonKafkaClientMapper.AlterConfigOperationToKafka(requestedConfigUpdate.Operation)
		if err != nil {
			return nil, err
		}
		topicConfigUpdate.Op = kafkaOp

		topicConfigUpdates[i] = topicConfigUpdate
	}
	alterTopicResource.Configs = topicConfigUpdates

	// Construct kafka request for altering configs
	kafkaReq := kmsg.NewIncrementalAlterConfigsRequest()
	kafkaReq.Resources = []kmsg.IncrementalAlterConfigsRequestResource{alterTopicResource}

	return &kafkaReq, nil
}

func (k *mapper) kafkaMetadataToProto(metadata *kmsg.MetadataResponse) []*v1alpha2.ListTopicsResponse_Topic {
	topics := make([]*v1alpha2.ListTopicsResponse_Topic, len(metadata.Topics))
	for i, topicMetadata := range metadata.Topics {
		topics[i] = k.kafkaTopicMetadataToProto(topicMetadata)
	}

	return topics
}

func (*mapper) kafkaTopicMetadataToProto(topicMetadata kmsg.MetadataResponseTopic) *v1alpha2.ListTopicsResponse_Topic {
	// We iterate through all partitions to figure out the replication factor,
	// in case we get an error for the first partitions
	replicationFactor := -1
	for _, partition := range topicMetadata.Partitions {
		if len(partition.Replicas) > replicationFactor {
			replicationFactor = len(partition.Replicas)
		}
	}

	return &v1alpha2.ListTopicsResponse_Topic{
		Name:              *topicMetadata.Topic,
		Internal:          topicMetadata.IsInternal,
		PartitionCount:    int32(len(topicMetadata.Partitions)),
		ReplicationFactor: int32(replicationFactor),
	}
}

func (k *mapper) setTopicConfigurationsToKafka(req *v1alpha2.SetTopicConfigurationsRequest) *kmsg.AlterConfigsRequest {
	alterConfigResource := kmsg.NewAlterConfigsRequestResource()
	alterConfigResource.ResourceType = kmsg.ConfigResourceTypeTopic
	alterConfigResource.ResourceName = req.TopicName

	for _, config := range req.Configurations {
		alterConfigResource.Configs = append(alterConfigResource.Configs, k.setTopicConfigurationsResourceToKafka(config))
	}

	kafkaReq := kmsg.NewAlterConfigsRequest()
	kafkaReq.Resources = []kmsg.AlterConfigsRequestResource{alterConfigResource}

	return &kafkaReq
}

func (*mapper) setTopicConfigurationsResourceToKafka(req *v1alpha2.SetTopicConfigurationsRequest_SetConfiguration) kmsg.AlterConfigsRequestResourceConfig {
	kafkaReq := kmsg.NewAlterConfigsRequestResourceConfig()
	kafkaReq.Name = req.Name
	kafkaReq.Value = req.Value

	return kafkaReq
}
