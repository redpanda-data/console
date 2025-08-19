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
	"log/slog"

	"github.com/twmb/franz-go/pkg/kadm"
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

// getConsumerGroupOffsets returns a nested map where the group id is the key
//
//nolint:gocognit,cyclop // Consider using kadm's CalculateGroupLag. Works slightly different, required DescribedGroup.
func (s *Service) getConsumerGroupOffsets(ctx context.Context, adminCl *kadm.Client, groups []string) (map[string][]GroupTopicOffsets, error) {
	// 1. Fetch all Consumer Group Offsets for each Topic
	fetchOffsetResponses := adminCl.FetchManyOffsets(ctx, groups...)
	var lastErr error
	fetchOffsetResponses.EachError(func(shardRes kadm.FetchOffsetsResponse) {
		s.logger.Warn("failed to fetch group offset",
			slog.String("group", shardRes.Group),
			slog.Any("error", shardRes.Err))
		lastErr = shardRes.Err
	})
	if fetchOffsetResponses.AllFailed() {
		s.logger.ErrorContext(ctx, "failed to list consumer group offsets", slog.Any("error", lastErr))
		return nil, fmt.Errorf("all requests for fetchinf group offsets have failed, last error is: %w", lastErr)
	}

	groupOffsets := make(map[string]map[string]partitionOffsets) // Group -> Topic -> PartitionID -> Offset
	for group, offsetResponses := range fetchOffsetResponses {
		if offsetResponses.Err != nil {
			continue // We already logged this error earlier
		}
		if _, exists := groupOffsets[group]; !exists {
			groupOffsets[group] = make(map[string]partitionOffsets)
		}

		offsetResponses.Fetched.Each(func(offsetResponse kadm.OffsetResponse) {
			if offsetResponse.Err != nil {
				s.logger.Warn("failed to retrieve group offset",
					slog.String("group", group),
					slog.String("topic", offsetResponse.Topic),
					slog.Int("partition", int(offsetResponse.Partition)),
					slog.Any("error", offsetResponse.Err))
				return
			}

			if _, exists := groupOffsets[group][offsetResponse.Topic]; !exists {
				groupOffsets[group][offsetResponse.Topic] = make(map[int32]int64)
			}

			groupOffsets[group][offsetResponse.Topic][offsetResponse.Partition] = offsetResponse.At
		})
	}

	// 2. Fetch all partition watermarks so that we can calculate the consumer group lags
	// Fetch all consumed topics and their partitions so that we know whose partitions we want the high watermarks for.
	topicsWithOffsets := fetchOffsetResponses.CommittedPartitions().Topics()

	metadata, err := adminCl.Metadata(ctx, topicsWithOffsets...)
	if err != nil {
		s.logger.ErrorContext(ctx, "failed to get topic metadata", slog.Any("topics", topicsWithOffsets), slog.Any("error", err))
		return nil, fmt.Errorf("failed to get topic metadata: %w", err)
	}

	topicsEndOffsets, err := adminCl.ListEndOffsets(ctx, metadata.Topics.Names()...)
	if err != nil {
		return nil, fmt.Errorf("failed to list end offsets for topics: %w", err)
	}
	if topicsEndOffsets.Error() != nil {
		return nil, fmt.Errorf("failed to list end offsets for topics: %w", topicsEndOffsets.Error())
	}

	// topicPartitions whose high watermark shall be requested
	topicPartitions := make(map[string][]int32, len(metadata.Topics))

	type partitionInfo struct {
		PartitionID   int32
		Error         string
		HighWaterMark int64
	}
	partitionInfoByIDAndTopic := make(map[string]map[int32]partitionInfo)

	for _, td := range metadata.Topics {
		partitionInfoByIDAndTopic[td.Topic] = make(map[int32]partitionInfo)
		for _, partition := range td.Partitions {
			var errMsg string
			if partition.Err != nil {
				errMsg = partition.Err.Error()
			} else {
				// Not an offline partition nor unauthorized, so let's add it to the list
				// of partition high watermarks we want to request
				topicPartitions[td.Topic] = append(topicPartitions[td.Topic], partition.Partition)
			}

			endOffset := int64(-1)
			if offset, exists := topicsEndOffsets.Lookup(td.Topic, partition.Partition); exists {
				endOffset = offset.Offset
			}
			partitionInfoByIDAndTopic[td.Topic][partition.Partition] = partitionInfo{
				PartitionID:   partition.Partition,
				Error:         errMsg,
				HighWaterMark: endOffset,
			}
		}
	}

	// 3. Now that we've got all partition high water marks as well as the consumer group offsets we can calculate the lags
	res := make(map[string][]GroupTopicOffsets, len(groups))
	for _, group := range groups {
		topicLags := make([]GroupTopicOffsets, 0)

		for topic, partitionOffsets := range groupOffsets[group] {
			// In this scope we iterate on a single group's, single topic's offset
			childLogger := s.logger.With(slog.String("group", group), slog.String("topic", topic))

			highWaterMarks, ok := partitionInfoByIDAndTopic[topic]
			if !ok {
				childLogger.ErrorContext(ctx, "no partition watermark for the group's topic available")
				return nil, errors.New("no partition watermark for the group's topic available")
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
					Lag:           lag,
				})
			}
			topicLags = append(topicLags, t)
		}

		res[group] = topicLags
	}

	return res, nil
}
