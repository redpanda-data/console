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
	"errors"
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"

	loggerpkg "github.com/redpanda-data/console/backend/pkg/logger"
)

// TopicOffset contains all topics' partitions offsets.
type TopicOffset struct {
	TopicName  string            `json:"topicName"`
	Partitions []PartitionOffset `json:"partitions"`
}

// PartitionOffset describes a partition's offset (can be the earliest or latest, depending on the request).
type PartitionOffset struct {
	Error       string `json:"error,omitempty"`
	PartitionID int32  `json:"partitionId"`
	Offset      int64  `json:"offset"`
	Timestamp   int64  `json:"timestamp"`
}

// ListOffsets lists partition offsets (either earliest or latest, depending on the timestamp parameter)
// of one or topic names.
func (s *Service) ListOffsets(ctx context.Context, topicNames []string, timestamp int64) ([]TopicOffset, error) {
	cl, adminCl, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}
	metadata, err := adminCl.Metadata(ctx, topicNames...)
	if err != nil {
		return nil, errors.New("failed to request partition info for topics")
	}
	if err := metadata.Topics.Error(); err != nil {
		return nil, fmt.Errorf("failed to request topic metadata: %w", err)
	}

	topicPartitions := make(map[string][]int32, len(metadata.Topics))
	for _, topic := range metadata.Topics {
		for _, partition := range topic.Partitions {
			if partition.Err != nil {
				return nil, fmt.Errorf("failed to request partition info for topic %q, partition: '%d': %w", partition.Topic, partition.Partition, partition.Err)
			}
			topicPartitions[partition.Topic] = append(topicPartitions[partition.Topic], partition.Partition)
		}
	}
	offsets := s.listOffsets(ctx, cl, topicPartitions, timestamp)

	offsetResponses := make([]TopicOffset, 0, len(offsets))
	for topicName, partitions := range offsets {
		pOffsets := make([]PartitionOffset, len(partitions))
		for pID, partition := range partitions {
			if partition.Error != "" {
				pOffsets[pID] = PartitionOffset{
					Error:       partition.Error,
					PartitionID: pID,
					Offset:      partition.Offset,
				}
				continue
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

// ListOffsets returns a nested map of: topic -> partitionID -> offset. Each partition may have an error because the
// leader is not available to answer the requests, because the partition is offline etc.
func (s *Service) listOffsets(ctx context.Context, kafkaCl *kgo.Client, topicPartitions map[string][]int32, timestamp int64) map[string]map[int32]PartitionOffset {
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
	resShards := kafkaCl.RequestSharded(ctx, &req)

	partitionsByTopic := make(map[string]map[int32]PartitionOffset)
	for _, shard := range resShards {
		err := shard.Err
		if err != nil {
			shardReq, ok := shard.Req.(*kmsg.ListOffsetsRequest)
			if !ok {
				loggerpkg.Fatal(s.logger, "failed to cast ListOffsetsRequest")
			}

			// Create an entry for each failed shard so that we each failed partition is visible too
			for _, topic := range shardReq.Topics {
				partitions, ok := partitionsByTopic[topic.Topic]
				if !ok {
					partitions = make(map[int32]PartitionOffset)
				}
				for _, p := range topic.Partitions {
					partitions[p.Partition] = PartitionOffset{
						PartitionID: p.Partition,
						Offset:      -1,
						Timestamp:   timestamp,
						Error:       errorToString(err),
					}
				}
				partitionsByTopic[topic.Topic] = partitions
			}
			continue
		}

		// Create an entry for each successfully requested partition
		res, ok := shard.Resp.(*kmsg.ListOffsetsResponse)
		if !ok {
			loggerpkg.Fatal(s.logger, "failed to cast ListOffsetsResponse")
		}
		for _, topic := range res.Topics {
			partitions, ok := partitionsByTopic[topic.Topic]
			if !ok {
				partitions = make(map[int32]PartitionOffset)
			}
			for _, p := range topic.Partitions {
				partitions[p.Partition] = PartitionOffset{
					PartitionID: p.Partition,
					Offset:      p.Offset,
					Timestamp:   p.Timestamp,
					Error:       errorToString(err),
				}
			}
			partitionsByTopic[topic.Topic] = partitions
		}
	}

	return partitionsByTopic
}
