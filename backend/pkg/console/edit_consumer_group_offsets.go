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
	"net/http"
	"strings"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/kafka"
)

type EditConsumerGroupOffsetsResponse struct {
	Error  string                                  `json:"error,omitempty"`
	Topics []EditConsumerGroupOffsetsResponseTopic `json:"topics"`
}

type EditConsumerGroupOffsetsResponseTopic struct {
	TopicName  string                                           `json:"topicName"`
	Partitions []EditConsumerGroupOffsetsResponseTopicPartition `json:"partitions"`
}

type EditConsumerGroupOffsetsResponseTopicPartition struct {
	ID    int32  `json:"partitionID"`
	Error string `json:"error,omitempty"`
}

// EditConsumerGroupOffsets edits the group offsets of one or more partitions.
func (s *Service) EditConsumerGroupOffsets(ctx context.Context, groupID string, topics []kmsg.OffsetCommitRequestTopic) (*EditConsumerGroupOffsetsResponse, *rest.Error) {
	// 0. Check if consumer group is empty, otherwise we can't edit the group offsets and want to provide a proper
	// error message for the frontend.
	describedGroup, err := s.kafkaSvc.DescribeConsumerGroup(ctx, groupID)
	if err != nil {
		return nil, &rest.Error{
			Err:     fmt.Errorf("failed to check group state: %w", err),
			Status:  http.StatusServiceUnavailable,
			Message: fmt.Sprintf("Failed to check consumer group state before proceeding: %v", err.Error()),
		}
	}
	if !strings.EqualFold(describedGroup.State, "empty") {
		return &EditConsumerGroupOffsetsResponse{
			Error:  fmt.Sprintf("Consumer group is still active and therefore can't be edited. Current Group State is: %v", describedGroup.State),
			Topics: nil,
		}, nil
	}

	// 1. The provided topic partitions might use special offsets (-2, -1) that need to be resolved to the earliest
	// or oldest offset before sending the edit group request to Kafka.
	topicPartitions := make(map[string][]int32)
	for _, topic := range topics {
		for _, partition := range topic.Partitions {
			topicPartitions[topic.Topic] = append(topicPartitions[topic.Topic], partition.Partition)
		}
	}
	waterMarks, err := s.kafkaSvc.GetPartitionMarksBulk(ctx, topicPartitions)
	if err != nil {
		return nil, &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to list topic partitions because partition watermarks couldn't be fetched: %v", err.Error()),
			InternalLogs: nil,
		}
	}

	// Because topics is immutable and we want to replace special offsets (earliest/oldest) with the actual watermarks
	// we are effectively rebuilding the offset commit request slice.
	substitutedTopics := make([]kmsg.OffsetCommitRequestTopic, len(topics))
	for i, topic := range topics {
		watermark, topicMarkExists := waterMarks[topic.Topic]

		substitutedPartitions := make([]kmsg.OffsetCommitRequestTopicPartition, len(topic.Partitions))
		for j, partition := range topic.Partitions {
			if partition.Offset >= 0 {
				substitutedPartitions[j] = partition
				continue
			}

			// Let's replace the special offset (earliest / oldest) with the actual watermark
			if !topicMarkExists {
				return nil, &rest.Error{
					Err:          fmt.Errorf("watermarks for topic '%v' are missing", topic.Topic),
					Status:       http.StatusServiceUnavailable,
					Message:      fmt.Sprintf("Can't substitute earliest/oldest offsets due to missing topic watermarks"),
					InternalLogs: nil,
				}
			}

			partitionMark, exists := watermark[partition.Partition]
			if !exists {
				return nil, &rest.Error{
					Err:          fmt.Errorf("watermarks for topic '%v', partition '%v' are missing", topic.Topic, partition.Partition),
					Status:       http.StatusServiceUnavailable,
					Message:      fmt.Sprintf("Can't substitute earliest/oldest offsets due to missing partition watermarks"),
					InternalLogs: nil,
				}
			}

			switch partition.Offset {
			case kafka.TimestampLatest:
				partition.Offset = partitionMark.High
			case kafka.TimestampEarliest:
				partition.Offset = partitionMark.Low
			}
			substitutedPartitions[j] = partition
		}
		substitutedTopics[i] = kmsg.OffsetCommitRequestTopic{
			Topic:      topic.Topic,
			Partitions: substitutedPartitions,
		}
	}

	commitResponse, err := s.kafkaSvc.EditConsumerGroupOffsets(ctx, groupID, substitutedTopics)
	if err != nil {
		return nil, &rest.Error{
			Err:     err,
			Status:  http.StatusServiceUnavailable,
			Message: fmt.Sprintf("Edit consumer group offsets failed: %v", err.Error()),
		}
	}

	editedTopics := make([]EditConsumerGroupOffsetsResponseTopic, len(commitResponse.Topics))
	for i, topic := range commitResponse.Topics {
		partitions := make([]EditConsumerGroupOffsetsResponseTopicPartition, len(topic.Partitions))
		for j, partition := range topic.Partitions {
			err := kerr.ErrorForCode(partition.ErrorCode)
			var errMsg string
			if err != nil {
				errMsg = err.Error()
			}
			partitions[j] = EditConsumerGroupOffsetsResponseTopicPartition{
				ID:    partition.Partition,
				Error: errMsg,
			}
		}
		editedTopics[i] = EditConsumerGroupOffsetsResponseTopic{
			TopicName:  topic.Topic,
			Partitions: partitions,
		}
	}

	return &EditConsumerGroupOffsetsResponse{
		Error:  "",
		Topics: editedTopics,
	}, nil
}
