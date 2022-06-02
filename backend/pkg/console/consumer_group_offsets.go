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

	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"

	"go.uber.org/zap"
)

type partitionOffsets map[int32]int64

// GroupTopicOffsets describes the kafka lag for a single topic and it's partitions for a single consumer group
type GroupTopicOffsets struct {
	Topic                string             `json:"topic"`
	SummedLag            int64              `json:"summedLag"` // Sums all partition lags (non consumed partitions are not considered)
	PartitionCount       int                `json:"partitionCount"`
	PartitionsWithOffset int                `json:"partitionsWithOffset"` // Number of partitions which have an active group offset
	PartitionOffsets     []PartitionOffsets `json:"partitionOffsets"`
}

// PartitionOffsets describes the kafka lag for a partition for a single consumer group
type PartitionOffsets struct {
	// Error will be set when the high water mark could not be fetched
	Error         string `json:"error,omitempty"`
	PartitionID   int32  `json:"partitionId"`
	GroupOffset   int64  `json:"groupOffset"`
	HighWaterMark int64  `json:"highWaterMark"`
	Lag           int64  `json:"lag"`
}

// convertOffsets returns a map where the key is the topic name
func convertOffsets(offsets *kmsg.OffsetFetchResponse) map[string]partitionOffsets {
	res := make(map[string]partitionOffsets, len(offsets.Topics))
	for _, topic := range offsets.Topics {
		pOffsets := make(partitionOffsets, len(topic.Partitions))
		for _, partition := range topic.Partitions {
			pOffsets[partition.Partition] = partition.Offset
		}

		res[topic.Topic] = pOffsets
	}

	return res
}

// getConsumerGroupOffsets returns a nested map where the group id is the key
func (s *Service) getConsumerGroupOffsets(ctx context.Context, groups []string) (map[string][]GroupTopicOffsets, error) {
	// 1. Fetch all Consumer Group Offsets for each Topic
	offsets, err := s.kafkaSvc.ListConsumerGroupOffsetsBulk(ctx, groups)
	if err != nil {
		s.logger.Error("failed to list consumer group offsets in bulk", zap.Error(err))
		return nil, fmt.Errorf("failed to list consumer group offsets in bulk")
	}

	offsetsByGroup := make(map[string]map[string]partitionOffsets) // GroupID -> TopicName -> partitionOffsets
	for group, offset := range offsets {
		offsetsByGroup[group] = convertOffsets(offset)
	}

	// 2. Fetch all partition watermarks so that we can calculate the consumer group lags
	// Fetch all consumed topics and their partitions so that we know whose partitions we want the high water marks for
	topicNames := make([]string, 0)
	for _, topicOffset := range offsetsByGroup {
		for topic := range topicOffset {
			topicNames = append(topicNames, topic)
		}
	}

	metadata, err := s.kafkaSvc.GetMetadata(ctx, topicNames)
	if err != nil {
		s.logger.Error("failed to get topic metadata", zap.Strings("topics", topicNames), zap.Error(err))
		return nil, fmt.Errorf("failed to get topic metadata: %w", err)
	}

	// topicPartitions whose high water mark shall be requested
	topicPartitions := make(map[string][]int32, len(topicNames))

	type partitionInfo struct {
		PartitionID   int32
		Error         string
		HighWaterMark int64
	}
	partitionInfoByIDAndTopic := make(map[string]map[int32]partitionInfo)

	for _, topic := range metadata.Topics {
		topicName := *topic.Topic
		partitionInfoByIDAndTopic[topicName] = make(map[int32]partitionInfo)

		for _, partition := range topic.Partitions {
			partitionID := partition.Partition
			err := kerr.ErrorForCode(partition.ErrorCode)
			errMsg := ""
			if err != nil {
				errMsg = err.Error()
			} else {
				// Not an offline partition, so let's try to request this partition's high watermark
				topicPartitions[topicName] = append(topicPartitions[topicName], partitionID)
			}
			partitionInfoByIDAndTopic[topicName][partitionID] = partitionInfo{
				PartitionID:   partitionID,
				Error:         errMsg,
				HighWaterMark: -1, // Not yet requested
			}
		}
	}

	highMarkRes := s.kafkaSvc.ListOffsets(ctx, topicPartitions, kafka.TimestampLatest)

	// 3. Format high water marks
	for topicName, partitions := range highMarkRes {
		for pID, partition := range partitions {
			if err != nil {
				partitionInfoByIDAndTopic[topicName][pID] = partitionInfo{
					PartitionID:   pID,
					Error:         err.Error(),
					HighWaterMark: -1,
				}
				continue
			}
			partitionInfoByIDAndTopic[topicName][pID] = partitionInfo{
				PartitionID:   pID,
				HighWaterMark: partition.Offset,
			}
		}
	}

	// 4. Now that we've got all partition high water marks as well as the consumer group offsets we can calculate the lags
	res := make(map[string][]GroupTopicOffsets, len(groups))
	for _, group := range groups {
		topicLags := make([]GroupTopicOffsets, 0)
		for topic, partitionOffsets := range offsetsByGroup[group] {
			// In this scope we iterate on a single group's, single topic's offset
			childLogger := s.logger.With(zap.String("group", group), zap.String("topic", topic))

			highWaterMarks, ok := partitionInfoByIDAndTopic[topic]
			if !ok {
				childLogger.Error("no partition watermark for the group's topic available")
				return nil, fmt.Errorf("no partition watermark for the group's topic available")
			}

			// Take note, it's possible that a consumer group does not have active offsets for all partitions, let's make that transparent!
			// For this reason we rather iterate on the partition water marks rather than the group partition offsets.
			t := GroupTopicOffsets{
				Topic:                topic,
				SummedLag:            0,
				PartitionCount:       len(highWaterMarks),
				PartitionsWithOffset: 0,
				PartitionOffsets:     make([]PartitionOffsets, 0),
			}
			for pID, watermark := range highWaterMarks {
				if watermark.Error != "" {
					t.PartitionOffsets = append(t.PartitionOffsets, PartitionOffsets{Error: watermark.Error, PartitionID: pID})
					continue
				}

				groupOffset, hasGroupOffset := partitionOffsets[pID]
				if !hasGroupOffset {
					continue
				}
				t.PartitionsWithOffset++

				lag := watermark.HighWaterMark - groupOffset
				if lag < 0 {
					// If Watermark has been updated after we got the group offset lag could be negative, which ofc doesn't make sense
					lag = 0
				}
				t.SummedLag += lag
				t.PartitionOffsets = append(t.PartitionOffsets, PartitionOffsets{
					PartitionID:   pID,
					GroupOffset:   groupOffset,
					HighWaterMark: watermark.HighWaterMark,
					Lag:           lag})
			}
			topicLags = append(topicLags, t)
		}

		res[group] = topicLags
	}

	return res, nil
}
