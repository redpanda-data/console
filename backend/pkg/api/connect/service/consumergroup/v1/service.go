// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package consumergroup contains all handlers for the ConsumerGroup endpoints.
package consumergroup

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"connectrpc.com/connect"
	"github.com/twmb/franz-go/pkg/kmsg"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/console"
	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
)

var _ dataplanev1connect.ConsumerGroupServiceHandler = (*Service)(nil)

// Service implements the handlers for ConsumerGroup endpoints.
type Service struct {
	logger     *slog.Logger
	consoleSvc console.Servicer
}

// NewService creates a new ConsumerGroup service handler.
func NewService(
	logger *slog.Logger,
	consoleSvc console.Servicer,
) *Service {
	return &Service{
		logger:     logger,
		consoleSvc: consoleSvc,
	}
}

// EditConsumerGroupOffsets edits offsets for a consumer group's topic partitions.
func (s *Service) EditConsumerGroupOffsets(ctx context.Context, req *connect.Request[v1.EditConsumerGroupOffsetsRequest]) (*connect.Response[v1.EditConsumerGroupOffsetsResponse], error) {
	kmsgReq := make([]kmsg.OffsetCommitRequestTopic, len(req.Msg.GetTopics()))
	for i, topic := range req.Msg.GetTopics() {
		partitions := make([]kmsg.OffsetCommitRequestTopicPartition, len(topic.GetPartitions()))
		for j, partition := range topic.GetPartitions() {
			partitionReq := kmsg.NewOffsetCommitRequestTopicPartition()
			partitionReq.Partition = partition.GetPartitionId()
			partitionReq.Offset = partition.GetOffset()
			partitions[j] = partitionReq
		}
		topicReq := kmsg.NewOffsetCommitRequestTopic()
		topicReq.Topic = topic.GetTopicName()
		topicReq.Partitions = partitions
		kmsgReq[i] = topicReq
	}

	res, restErr := s.consoleSvc.EditConsumerGroupOffsets(ctx, req.Msg.GetGroupId(), kmsgReq)
	if restErr != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			restErr.Err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String()),
		)
	}

	protoTopics := make([]*v1.EditConsumerGroupOffsetsResponse_Topic, 0, len(res.Topics))
	for _, topic := range res.Topics {
		protoPartitions := make([]*v1.EditConsumerGroupOffsetsResponse_Topic_Partition, 0, len(topic.Partitions))
		for _, partition := range topic.Partitions {
			protoPartitions = append(protoPartitions, &v1.EditConsumerGroupOffsetsResponse_Topic_Partition{
				PartitionId: partition.ID,
				Error:       partition.Error,
			})
		}
		protoTopics = append(protoTopics, &v1.EditConsumerGroupOffsetsResponse_Topic{
			TopicName:  topic.TopicName,
			Partitions: protoPartitions,
		})
	}

	return connect.NewResponse(&v1.EditConsumerGroupOffsetsResponse{
		Error:  res.Error,
		Topics: protoTopics,
	}), nil
}

// DeleteConsumerGroupOffsets deletes offsets for a consumer group's topic partitions.
func (s *Service) DeleteConsumerGroupOffsets(ctx context.Context, req *connect.Request[v1.DeleteConsumerGroupOffsetsRequest]) (*connect.Response[v1.DeleteConsumerGroupOffsetsResponse], error) {
	kmsgReq := make([]kmsg.OffsetDeleteRequestTopic, len(req.Msg.GetTopics()))
	for i, topic := range req.Msg.GetTopics() {
		partitions := make([]kmsg.OffsetDeleteRequestTopicPartition, len(topic.GetPartitions()))
		for j, partition := range topic.GetPartitions() {
			partitionReq := kmsg.NewOffsetDeleteRequestTopicPartition()
			partitionReq.Partition = partition.GetPartitionId()
			partitions[j] = partitionReq
		}
		topicReq := kmsg.NewOffsetDeleteRequestTopic()
		topicReq.Topic = topic.GetTopicName()
		topicReq.Partitions = partitions
		kmsgReq[i] = topicReq
	}

	deletedTopics, err := s.consoleSvc.DeleteConsumerGroupOffsets(ctx, req.Msg.GetGroupId(), kmsgReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("failed to delete consumer group offsets: %w", err),
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	protoTopics := make([]*v1.DeleteConsumerGroupOffsetsResponse_Topic, 0, len(deletedTopics))
	for _, topic := range deletedTopics {
		protoPartitions := make([]*v1.DeleteConsumerGroupOffsetsResponse_Topic_Partition, 0, len(topic.Partitions))
		for _, partition := range topic.Partitions {
			protoPartitions = append(protoPartitions, &v1.DeleteConsumerGroupOffsetsResponse_Topic_Partition{
				PartitionId: partition.ID,
				Error:       partition.Error,
			})
		}
		protoTopics = append(protoTopics, &v1.DeleteConsumerGroupOffsetsResponse_Topic{
			TopicName:  topic.TopicName,
			Partitions: protoPartitions,
		})
	}

	return connect.NewResponse(&v1.DeleteConsumerGroupOffsetsResponse{Topics: protoTopics}), nil
}

// DeleteConsumerGroup deletes a consumer group.
func (s *Service) DeleteConsumerGroup(ctx context.Context, req *connect.Request[v1.DeleteConsumerGroupRequest]) (*connect.Response[v1.DeleteConsumerGroupResponse], error) {
	err := s.consoleSvc.DeleteConsumerGroup(ctx, req.Msg.GetGroupId())
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("failed to delete consumer group: %w", err),
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	connectResponse := connect.NewResponse(&v1.DeleteConsumerGroupResponse{})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusNoContent))

	return connectResponse, nil
}
