// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package owl

import (
	"context"
	"fmt"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
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

func (s *Service) CreateTopic(ctx context.Context, createTopicReq kmsg.CreateTopicsRequestTopic) (CreateTopicResponse, *rest.Error) {
	internalLogs := []zapcore.Field{
		zap.String("topic_name", createTopicReq.Topic),
		zap.Int32("partition_count", createTopicReq.NumPartitions),
		zap.Int16("replication_factor", createTopicReq.ReplicationFactor),
		zap.Int("configuration_count", len(createTopicReq.Configs)),
	}
	createTopicRes, err := s.kafkaSvc.CreateTopic(ctx, createTopicReq)
	if err != nil {
		return CreateTopicResponse{}, &rest.Error{
			Err:          fmt.Errorf("failed to create topic: %w", err),
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to create topic: %v", err.Error()),
			InternalLogs: internalLogs,
			IsSilent:     false,
		}
	}

	err = kerr.ErrorForCode(createTopicRes.ErrorCode)
	if err != nil {
		return CreateTopicResponse{}, &rest.Error{
			Err:          fmt.Errorf("failed to create topic, inner kafka error: %w", err),
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to create topic, kafka responded with the following error: %v", err.Error()),
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
