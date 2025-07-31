// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// CreateTopicResponse is the response that is sent after creating a topic successfully.
type CreateTopicResponse struct {
	TopicName                  string                      `json:"topicName"`
	PartitionCount             int32                       `json:"partitionCount"`
	ReplicationFactor          int16                       `json:"replicationFactor"`
	CreateTopicResponseConfigs []CreateTopicResponseConfig `json:"configs"`
}

// CreateTopicResponseConfig represents a config property that is returned after a successful
// topic creation.
type CreateTopicResponseConfig struct {
	Name  string  `json:"name"`
	Value *string `json:"value"`
}

// CreateTopic creates a Kafka topic.
func (s *Service) CreateTopic(ctx context.Context, createTopicReq kmsg.CreateTopicsRequestTopic) (CreateTopicResponse, *rest.Error) {
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return CreateTopicResponse{}, errorToRestError(err)
	}

	internalLogs := []slog.Attr{
		slog.String("topic_name", createTopicReq.Topic),
		slog.Int("partition_count", int(createTopicReq.NumPartitions)),
		slog.Int("replication_factor", int(createTopicReq.ReplicationFactor)),
		slog.Int("configuration_count", len(createTopicReq.Configs)),
	}

	req := kmsg.NewCreateTopicsRequest()
	req.Topics = []kmsg.CreateTopicsRequestTopic{createTopicReq}

	createRes, err := req.RequestWith(ctx, cl)
	if err != nil {
		return CreateTopicResponse{}, &rest.Error{
			Err:          fmt.Errorf("failed to create topic: %w", err),
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to create topic: %v", err.Error()),
			InternalLogs: internalLogs,
			IsSilent:     false,
		}
	}

	if len(createRes.Topics) != 1 {
		return CreateTopicResponse{}, &rest.Error{
			Err:          fmt.Errorf("unexpected number of topic responses, expected exactly one but got '%v'", len(createRes.Topics)),
			Status:       http.StatusInternalServerError,
			Message:      fmt.Sprintf("unexpected number of topic responses, expected exactly one but got '%v'", len(createRes.Topics)),
			InternalLogs: internalLogs,
			IsSilent:     false,
		}
	}

	createTopicRes := createRes.Topics[0]
	kafkaErr := newKafkaErrorWithDynamicMessage(createTopicRes.ErrorCode, createTopicRes.ErrorMessage)
	if kafkaErr != nil {
		return CreateTopicResponse{}, &rest.Error{
			Err:          fmt.Errorf("failed to create topic, inner kafka error: %w", kafkaErr),
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to create topic, kafka responded with the following error: %v", kafkaErr.Error()),
			InternalLogs: internalLogs,
			IsSilent:     false,
		}
	}

	configs := make([]CreateTopicResponseConfig, len(createTopicRes.Configs))
	for i, cfg := range createTopicRes.Configs {
		configs[i] = CreateTopicResponseConfig{
			Name:  cfg.Name,
			Value: cfg.Value,
		}
	}

	return CreateTopicResponse{
		TopicName:                  createTopicRes.Topic,
		PartitionCount:             createTopicRes.NumPartitions,
		ReplicationFactor:          createTopicRes.ReplicationFactor,
		CreateTopicResponseConfigs: configs,
	}, nil
}

// CreateTopics proxies the create topic request to the Kafka client.
func (s *Service) CreateTopics(ctx context.Context, createReq *kmsg.CreateTopicsRequest) (*kmsg.CreateTopicsResponse, error) {
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}
	return createReq.RequestWith(ctx, cl)
}
