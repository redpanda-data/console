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
	"github.com/twmb/franz-go/pkg/kerr"
)

type TopicOffset struct {
	TopicName  string            `json:"topicName"`
	Partitions []PartitionOffset `json:"partitions"`
}

type PartitionOffset struct {
	Error       string `json:"error,omitempty"`
	PartitionID int32  `json:"partitionId"`
	Offset      int64  `json:"offset"`
	Timestamp   int64  `json:"timestamp"`
}

func (s *Service) ListOffsets(ctx context.Context, topicNames []string, timestamp int64) ([]TopicOffset, error) {
	metadata, err := s.kafkaSvc.GetMetadata(ctx, topicNames)
	if err != nil {
		return nil, fmt.Errorf("failed to request partition info for topics")
	}

	topicPartitions := make(map[string][]int32, len(metadata.Topics))
	for _, topic := range metadata.Topics {
		err := kerr.ErrorForCode(topic.ErrorCode)
		if err != nil {
			return nil, fmt.Errorf("failed to request partition info for topic '%v': %w", topic.Topic, err)
		}

		for _, partition := range topic.Partitions {
			err := kerr.ErrorForCode(partition.ErrorCode)
			if err != nil {
				return nil, fmt.Errorf("failed to request partition info for topic '%v', partition: '%v': %w", topic.Topic, partition.Partition, err)
			}
			topicName := *topic.Topic
			topicPartitions[topicName] = append(topicPartitions[topicName], partition.Partition)
		}
	}
	offsets := s.kafkaSvc.ListOffsets(ctx, topicPartitions, timestamp)

	offsetResponses := make([]TopicOffset, 0, len(offsets))
	for topicName, partitions := range offsets {
		pOffsets := make([]PartitionOffset, len(partitions))
		for pID, partition := range partitions {
			if err != nil {
				pOffsets[pID] = PartitionOffset{
					Error:       err.Error(),
					PartitionID: pID,
					Offset:      partition.Offset,
				}
			}

			pOffsets[pID] = PartitionOffset{
				PartitionID: pID,
				Offset:      partition.Offset,
				Timestamp:   partition.Timestamp,
			}
		}
		offsetResponses = append(offsetResponses, TopicOffset{
			TopicName:  topicName,
			Partitions: pOffsets,
		})
	}

	return offsetResponses, nil
}
