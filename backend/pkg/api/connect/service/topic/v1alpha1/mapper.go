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
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
)

type apiVersionMapper struct{}

func (*apiVersionMapper) v1alpha1ToListTopicsv1alpha2(r *v1alpha1.ListTopicsRequest) *v1alpha2.ListTopicsRequest {
	var filter *v1alpha2.ListTopicsRequest_Filter
	if r.Filter != nil {
		filter = &v1alpha2.ListTopicsRequest_Filter{
			NameContains: r.GetFilter().GetNameContains(),
		}
	}

	return &v1alpha2.ListTopicsRequest{
		Filter:    filter,
		PageSize:  r.GetPageSize(),
		PageToken: r.GetPageToken(),
	}
}

func (*apiVersionMapper) v1alpha2ListTopicsResponseTov1alpha1(topics []*v1alpha2.ListTopicsResponse_Topic) []*v1alpha1.ListTopicsResponse_Topic {
	out := make([]*v1alpha1.ListTopicsResponse_Topic, 0, len(topics))

	for _, topic := range topics {
		out = append(out, &v1alpha1.ListTopicsResponse_Topic{
			Name:              topic.GetName(),
			Internal:          topic.GetInternal(),
			PartitionCount:    topic.GetPartitionCount(),
			ReplicationFactor: topic.GetReplicationFactor(),
		})
	}

	return out
}

func (*apiVersionMapper) v1alpha1ToDeleteTopicv1alpha2(r *v1alpha1.DeleteTopicRequest) *v1alpha2.DeleteTopicRequest {
	return &v1alpha2.DeleteTopicRequest{
		Name: r.GetName(),
	}
}

func (*apiVersionMapper) v1alpha1GetTopicConfigurationv1alpha2(r *v1alpha1.GetTopicConfigurationsRequest) *v1alpha2.GetTopicConfigurationsRequest {
	return &v1alpha2.GetTopicConfigurationsRequest{
		TopicName: r.GetTopicName(),
	}
}

func (*apiVersionMapper) v1alpha2TopicConfigsv1alpha1(configs []*v1alpha2.Topic_Configuration) []*v1alpha1.Topic_Configuration {
	out := make([]*v1alpha1.Topic_Configuration, 0, len(configs))

	for _, c := range configs {
		synonyms := make([]*v1alpha1.ConfigSynonym, 0, len(c.GetConfigSynonyms()))

		for _, s := range c.GetConfigSynonyms() {
			ns := &v1alpha1.ConfigSynonym{
				Name:   s.GetName(),
				Value:  s.Value,
				Source: mapv1alpha2ConfigSourcev1alpha1(s.GetSource()),
			}
			synonyms = append(synonyms, ns)
		}

		out = append(out, &v1alpha1.Topic_Configuration{
			Name:           c.GetName(),
			Type:           mapv1alpha2ConfigTypev1alpha1(c.GetType()),
			Value:          c.Value,
			Source:         mapv1alpha2ConfigSourcev1alpha1(c.GetSource()),
			ReadOnly:       c.GetReadOnly(),
			Sensitive:      c.GetSensitive(),
			ConfigSynonyms: synonyms,
			Documentation:  c.Documentation,
		})
	}

	return out
}

func (*apiVersionMapper) v1alpha1UpdateTopicConfigurationv1alpha2(r *v1alpha1.UpdateTopicConfigurationsRequest) *v1alpha2.UpdateTopicConfigurationsRequest {
	configs := make([]*v1alpha2.UpdateTopicConfigurationsRequest_UpdateConfiguration, 0, len(r.GetConfigurations()))
	for _, c := range r.GetConfigurations() {
		configs = append(configs, &v1alpha2.UpdateTopicConfigurationsRequest_UpdateConfiguration{
			Name:      c.GetName(),
			Value:     c.Value,
			Operation: mapV1alpha1ConfigAlterOperationToV1alpha2(c.GetOperation()),
		})
	}
	return &v1alpha2.UpdateTopicConfigurationsRequest{
		TopicName:      r.GetTopicName(),
		Configurations: configs,
	}
}

func (*apiVersionMapper) v1alpha1SetTopicConfigurationv1alpha2(r *v1alpha1.SetTopicConfigurationsRequest) *v1alpha2.SetTopicConfigurationsRequest {
	configs := make([]*v1alpha2.SetTopicConfigurationsRequest_SetConfiguration, 0, len(r.GetConfigurations()))

	for _, c := range r.GetConfigurations() {
		configs = append(configs, &v1alpha2.SetTopicConfigurationsRequest_SetConfiguration{
			Name:  c.GetName(),
			Value: c.Value,
		})
	}

	return &v1alpha2.SetTopicConfigurationsRequest{
		TopicName:      r.GetTopicName(),
		Configurations: configs,
	}
}

func (*apiVersionMapper) v1alpha1CreateTopicv1alpha2(r *v1alpha1.CreateTopicRequest) *v1alpha2.CreateTopicRequest {
	ras := make([]*v1alpha2.CreateTopicRequest_Topic_ReplicaAssignment, 0, len(r.GetTopic().GetReplicaAssignments()))
	for _, ra := range r.GetTopic().GetReplicaAssignments() {
		ras = append(ras, &v1alpha2.CreateTopicRequest_Topic_ReplicaAssignment{
			PartitionId: ra.GetPartitionId(),
			ReplicaIds:  ra.GetReplicaIds(),
		})
	}

	configs := make([]*v1alpha2.CreateTopicRequest_Topic_Config, 0, len(r.GetTopic().GetConfigs()))
	for _, c := range r.GetTopic().GetConfigs() {
		configs = append(configs, &v1alpha2.CreateTopicRequest_Topic_Config{
			Name:  c.GetName(),
			Value: c.Value,
		})
	}

	return &v1alpha2.CreateTopicRequest{
		Topic: &v1alpha2.CreateTopicRequest_Topic{
			Name:               r.GetTopic().GetName(),
			PartitionCount:     r.GetTopic().PartitionCount,
			ReplicationFactor:  r.GetTopic().ReplicationFactor,
			ReplicaAssignments: ras,
			Configs:            configs,
		},
		ValidateOnly: r.GetValidateOnly(),
	}
}

func (*apiVersionMapper) v1alpha2CreateTopicResponsev1alpha1(msg *v1alpha2.CreateTopicResponse) *v1alpha1.CreateTopicResponse {
	return &v1alpha1.CreateTopicResponse{
		Name:              msg.GetName(),
		PartitionCount:    msg.GetPartitionCount(),
		ReplicationFactor: msg.GetReplicationFactor(),
	}
}

func mapv1alpha2ConfigTypev1alpha1(t v1alpha2.ConfigType) v1alpha1.ConfigType {
	switch t {
	case v1alpha2.ConfigType_CONFIG_TYPE_BOOLEAN:
		return v1alpha1.ConfigType_CONFIG_TYPE_BOOLEAN
	case v1alpha2.ConfigType_CONFIG_TYPE_STRING:
		return v1alpha1.ConfigType_CONFIG_TYPE_STRING
	case v1alpha2.ConfigType_CONFIG_TYPE_INT:
		return v1alpha1.ConfigType_CONFIG_TYPE_INT
	case v1alpha2.ConfigType_CONFIG_TYPE_SHORT:
		return v1alpha1.ConfigType_CONFIG_TYPE_SHORT
	case v1alpha2.ConfigType_CONFIG_TYPE_LONG:
		return v1alpha1.ConfigType_CONFIG_TYPE_LONG
	case v1alpha2.ConfigType_CONFIG_TYPE_DOUBLE:
		return v1alpha1.ConfigType_CONFIG_TYPE_DOUBLE
	case v1alpha2.ConfigType_CONFIG_TYPE_LIST:
		return v1alpha1.ConfigType_CONFIG_TYPE_LIST
	case v1alpha2.ConfigType_CONFIG_TYPE_CLASS:
		return v1alpha1.ConfigType_CONFIG_TYPE_CLASS
	case v1alpha2.ConfigType_CONFIG_TYPE_PASSWORD:
		return v1alpha1.ConfigType_CONFIG_TYPE_PASSWORD
	default:
		return v1alpha1.ConfigType_CONFIG_TYPE_UNSPECIFIED
	}
}

func mapv1alpha2ConfigSourcev1alpha1(t v1alpha2.ConfigSource) v1alpha1.ConfigSource {
	switch t {
	case v1alpha2.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG:
		return v1alpha1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG
	case v1alpha2.ConfigSource_CONFIG_SOURCE_DYNAMIC_BROKER_CONFIG:
		return v1alpha1.ConfigSource_CONFIG_SOURCE_DYNAMIC_BROKER_CONFIG
	case v1alpha2.ConfigSource_CONFIG_SOURCE_DYNAMIC_DEFAULT_BROKER_CONFIG:
		return v1alpha1.ConfigSource_CONFIG_SOURCE_DYNAMIC_DEFAULT_BROKER_CONFIG
	case v1alpha2.ConfigSource_CONFIG_SOURCE_STATIC_BROKER_CONFIG:
		return v1alpha1.ConfigSource_CONFIG_SOURCE_STATIC_BROKER_CONFIG
	case v1alpha2.ConfigSource_CONFIG_SOURCE_DEFAULT_CONFIG:
		return v1alpha1.ConfigSource_CONFIG_SOURCE_DEFAULT_CONFIG
	case v1alpha2.ConfigSource_CONFIG_SOURCE_DYNAMIC_BROKER_LOGGER_CONFIG:
		return v1alpha1.ConfigSource_CONFIG_SOURCE_DYNAMIC_BROKER_LOGGER_CONFIG
	default:
		return v1alpha1.ConfigSource_CONFIG_SOURCE_UNSPECIFIED
	}
}

func mapV1alpha1ConfigAlterOperationToV1alpha2(t v1alpha1.ConfigAlterOperation) v1alpha2.ConfigAlterOperation {
	switch t {
	case v1alpha1.ConfigAlterOperation_CONFIG_ALTER_OPERATION_SET:
		return v1alpha2.ConfigAlterOperation_CONFIG_ALTER_OPERATION_SET
	case v1alpha1.ConfigAlterOperation_CONFIG_ALTER_OPERATION_DELETE:
		return v1alpha2.ConfigAlterOperation_CONFIG_ALTER_OPERATION_DELETE
	case v1alpha1.ConfigAlterOperation_CONFIG_ALTER_OPERATION_APPEND:
		return v1alpha2.ConfigAlterOperation_CONFIG_ALTER_OPERATION_APPEND
	case v1alpha1.ConfigAlterOperation_CONFIG_ALTER_OPERATION_SUBTRACT:
		return v1alpha2.ConfigAlterOperation_CONFIG_ALTER_OPERATION_SUBTRACT
	default:
		return v1alpha2.ConfigAlterOperation_CONFIG_ALTER_OPERATION_UNSPECIFIED
	}
}
