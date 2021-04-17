package owl

import (
	"context"
	"fmt"

	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"

	"go.uber.org/zap"
)

type partitionOffsets map[int32]int64

// ConsumerGroupLag describes the kafka lag for all topics/partitions for a single consumer group
type ConsumerGroupLag struct {
	GroupID   string      `json:"groupId"`
	TopicLags []*TopicLag `json:"topicLags"`
}

// GetTopicLag returns the group's topic lag or nil if the group has no group offsets on that topic
func (c *ConsumerGroupLag) GetTopicLag(topicName string) *TopicLag {
	for _, lag := range c.TopicLags {
		if lag.Topic == topicName {
			return lag
		}
	}

	return nil
}

// TopicLag describes the kafka lag for a single topic and it's partitions for a single consumer group
type TopicLag struct {
	Topic                string         `json:"topic"`
	SummedLag            int64          `json:"summedLag"` // Sums all partition lags (non consumed partitions are not considered)
	PartitionCount       int            `json:"partitionCount"`
	PartitionsWithOffset int            `json:"partitionsWithOffset"` // Number of partitions which have an active group offset
	PartitionLags        []PartitionLag `json:"partitionLags"`
}

// PartitionLag describes the kafka lag for a partition for a single consumer group
type PartitionLag struct {
	// Error will be set when the high water mark could not be fetched
	Error       string `json:"error,omitempty"`
	PartitionID int32  `json:"partitionId"`
	Offset      int64  `json:"offset"`
	Lag         int64  `json:"lag"`
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

// getConsumerGroupLags returns a nested map where the group id is the key
func (s *Service) getConsumerGroupLags(ctx context.Context, groups []string) (map[string]*ConsumerGroupLag, error) {
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

	topicPartitions := make(map[string][]int32, len(topicNames))
	for _, topic := range metadata.Topics {
		partitionIDs, err := s.kafkaSvc.PartitionsToPartitionIDs(topic.Partitions)
		if err != nil {
			s.logger.Error("failed to fetch partition list for calculating the group lags", zap.String("topic", topic.Topic), zap.Error(err))
			return nil, fmt.Errorf("failed to fetch partition list for calculating the group lags: %w", err)
		}

		topicPartitions[topic.Topic] = partitionIDs
	}

	highMarkRes, err := s.kafkaSvc.ListOffsets(ctx, topicPartitions, kafka.TimestampLatest)
	if err != nil {
		return nil, err
	}

	// 3. Format high water marks
	type highMark struct {
		PartitionID int32
		Error       string
		Offset      int64
	}
	highWaterMarks := make(map[string]map[int32]highMark)
	for _, topic := range highMarkRes.Topics {
		highWaterMarks[topic.Topic] = make(map[int32]highMark)
		for _, partition := range topic.Partitions {
			err := kerr.ErrorForCode(partition.ErrorCode)
			if err != nil {
				highWaterMarks[topic.Topic][partition.Partition] = highMark{
					PartitionID: partition.Partition,
					Error:       err.Error(),
					Offset:      -1,
				}
			}
			highWaterMarks[topic.Topic][partition.Partition] = highMark{
				PartitionID: partition.Partition,
				Offset:      partition.Offset,
			}
		}
	}

	// 4. Now that we've got all partition high water marks as well as the consumer group offsets we can calculate the lags
	res := make(map[string]*ConsumerGroupLag, len(groups))
	for _, group := range groups {
		topicLags := make([]*TopicLag, 0)
		for topic, partitionOffsets := range offsetsByGroup[group] {
			// In this scope we iterate on a single group's, single topic's offset
			childLogger := s.logger.With(zap.String("group", group), zap.String("topic", topic))

			highWaterMarks, ok := highWaterMarks[topic]
			if !ok {
				childLogger.Error("no partition watermark for the group's topic available")
				return nil, fmt.Errorf("no partition watermark for the group's topic available")
			}

			// Take note, it's possible that a consumer group does not have active offsets for all partitions, let's make that transparent!
			// For this reason we rather iterate on the partition water marks rather than the group partition offsets.
			t := TopicLag{
				Topic:                topic,
				SummedLag:            0,
				PartitionCount:       len(highWaterMarks),
				PartitionsWithOffset: 0,
				PartitionLags:        make([]PartitionLag, 0),
			}
			for pID, watermark := range highWaterMarks {
				if watermark.Error != "" {
					t.PartitionLags = append(t.PartitionLags, PartitionLag{
						Error:       watermark.Error,
						PartitionID: pID,
						Lag:         -1})
					continue
				}

				groupOffset, hasGroupOffset := partitionOffsets[pID]
				if !hasGroupOffset {
					continue
				}
				t.PartitionsWithOffset++

				lag := watermark.Offset - groupOffset
				if lag < 0 {
					// If Watermark has been updated after we got the group offset lag could be negative, which ofc doesn't make sense
					lag = 0
				}
				t.SummedLag += lag
				t.PartitionLags = append(t.PartitionLags, PartitionLag{PartitionID: pID, Offset: groupOffset, Lag: lag})
			}
			topicLags = append(topicLags, &t)
		}

		res[group] = &ConsumerGroupLag{
			GroupID:   group,
			TopicLags: topicLags,
		}
	}

	return res, nil
}
