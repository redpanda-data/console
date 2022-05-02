// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafka

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
)

const (
	TimestampLatest   = -1
	TimestampEarliest = -2
)

// PartitionMarks is a partitionID along with it's highest and lowest message index
type PartitionMarks struct {
	PartitionID int32
	// Error indicates whether there was an issue fetching the watermarks for this partition.
	Error error

	Low  int64
	High int64
}

// GetPartitionMarksBulk returns a map of: topicName -> partitionID -> PartitionMarks
func (s *Service) GetPartitionMarksBulk(ctx context.Context, topicPartitions map[string][]int32) (map[string]map[int32]*PartitionMarks, error) {
	// Send low & high watermark request in parallel
	g, ctx := errgroup.WithContext(ctx)

	var lowWaterMarks map[string]map[int32]ListOffsetsResponseTopicPartition
	var highWaterMarks map[string]map[int32]ListOffsetsResponseTopicPartition
	g.Go(func() error {
		lowWaterMarks = s.ListOffsets(ctx, topicPartitions, TimestampEarliest)
		return nil
	})
	g.Go(func() error {
		highWaterMarks = s.ListOffsets(ctx, topicPartitions, TimestampLatest)
		return nil
	})

	err := g.Wait()
	if err != nil {
		s.Logger.Error("failed to request partition marks in bulk", zap.Error(err))
		return nil, fmt.Errorf("failed to request PartitionMarks: %w", err)
	}

	result := make(map[string]map[int32]*PartitionMarks)
	// Pre initialize result map. Each requested partition should also have a response
	for topic, partitionIDs := range topicPartitions {
		result[topic] = make(map[int32]*PartitionMarks)
		for _, partitionID := range partitionIDs {
			result[topic][partitionID] = &PartitionMarks{
				PartitionID: partitionID,
				Error:       nil,
				Low:         -1, // -1 indicates that this offset has not yet been loaded
				High:        -1, // -1 indicates that this offset has not yet been loaded
			}
		}
	}

	// Iterate on all low watermarks and put the partial information into the result map
	for topicName, topic := range lowWaterMarks {
		for pID, partitionOffset := range topic {
			result[topicName][pID].Low = partitionOffset.Offset
			result[topicName][pID].Error = partitionOffset.Err
		}
	}

	// Enrich the partial information with the high water mark offsets. This loop is slightly different because
	// we check for existing errors and skip that.
	for topicName, topic := range highWaterMarks {
		for pID, partitionOffset := range topic {
			result[topicName][pID].High = partitionOffset.Offset
			result[topicName][pID].Error = partitionOffset.Err
		}
	}

	return result, nil
}

// GetPartitionMarks returns a map of: partitionID -> PartitionMarks
func (s *Service) GetPartitionMarks(ctx context.Context, topic string, partitionIDs []int32) (map[int32]*PartitionMarks, error) {
	// 1. Create topic partitions map that can be passed to the ListOffsets request
	topicPartitions := make(map[string][]int32)
	topicPartitions[topic] = partitionIDs

	// 2. Request partition marks
	partitionMarksByTopic, err := s.GetPartitionMarksBulk(ctx, topicPartitions)
	if err != nil {
		return nil, err
	}

	return partitionMarksByTopic[topic], nil
}

type ListOffsetsResponseTopicPartition struct {
	PartitionID int32
	Offset      int64
	Timestamp   int64
	Err         error
}

// ListOffsets returns a nested map of: topic -> partitionID -> offset. Each partition may have an error because the
// leader is not available to answer the requests, because the partition is offline etc.
func (s *Service) ListOffsets(ctx context.Context, topicPartitions map[string][]int32, timestamp int64) map[string]map[int32]ListOffsetsResponseTopicPartition {
	topicRequests := make([]kmsg.ListOffsetsRequestTopic, 0, len(topicPartitions))

	for topic, partitionIDs := range topicPartitions {
		// Build array of partition offset requests
		partitionRequests := make([]kmsg.ListOffsetsRequestTopicPartition, len(partitionIDs))
		for i, id := range partitionIDs {
			// Request oldest offset for that partition
			partitionReq := kmsg.NewListOffsetsRequestTopicPartition()
			partitionReq.Partition = id
			partitionReq.Timestamp = timestamp // -1 = latest, -2 = earliest
			partitionRequests[i] = partitionReq
		}

		// Push topic request into array
		topicReq := kmsg.NewListOffsetsRequestTopic()
		topicReq.Topic = topic
		topicReq.Partitions = partitionRequests
		topicRequests = append(topicRequests, topicReq)
	}

	req := kmsg.ListOffsetsRequest{
		Topics: topicRequests,
	}
	resShards := s.KafkaClient.RequestSharded(ctx, &req)

	partitionsByTopic := make(map[string]map[int32]ListOffsetsResponseTopicPartition)
	for _, shard := range resShards {
		err := shard.Err
		if err != nil {
			shardReq, ok := shard.Req.(*kmsg.ListOffsetsRequest)
			if !ok {
				s.Logger.Fatal("failed to cast ListOffsetsRequest")
			}

			// Create an entry for each failed shard so that we each failed partition is visible too
			for _, topic := range shardReq.Topics {
				partitions, ok := partitionsByTopic[topic.Topic]
				if !ok {
					partitions = make(map[int32]ListOffsetsResponseTopicPartition)
				}
				for _, p := range topic.Partitions {
					partitions[p.Partition] = ListOffsetsResponseTopicPartition{
						PartitionID: p.Partition,
						Offset:      -1,
						Timestamp:   timestamp,
						Err:         err,
					}
				}
				partitionsByTopic[topic.Topic] = partitions
			}
			continue
		}

		// Create an entry for each successfully requested partition
		res, ok := shard.Resp.(*kmsg.ListOffsetsResponse)
		if !ok {
			s.Logger.Fatal("failed to cast ListOffsetsResponse")
		}
		for _, topic := range res.Topics {
			partitions, ok := partitionsByTopic[topic.Topic]
			if !ok {
				partitions = make(map[int32]ListOffsetsResponseTopicPartition)
			}
			for _, p := range topic.Partitions {
				partitions[p.Partition] = ListOffsetsResponseTopicPartition{
					PartitionID: p.Partition,
					Offset:      p.Offset,
					Timestamp:   p.Timestamp,
					Err:         nil,
				}
			}
			partitionsByTopic[topic.Topic] = partitions
		}
	}

	return partitionsByTopic
}
