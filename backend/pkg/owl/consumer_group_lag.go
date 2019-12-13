package owl

import (
	"context"
	"fmt"

	"github.com/Shopify/sarama"
	"go.uber.org/zap"
)

type partitionOffsets map[int32]int64

// ConsumerGroupLag describes the kafka lag for all topics/partitions for a single consumer group
type ConsumerGroupLag struct {
	GroupID   string      `json:"groupId"`
	TopicLags []*TopicLag `json:"topicLags"`
}

// TopicLag describes the kafka lag for a single topic and it's partitions for a single consumer group
type TopicLag struct {
	Topic                 string         `json:"topic"`
	SummedLag             int64          `json:"summedLag"`             // Sums all partition lags (non consumed partitions are not considered)
	ConsumesAllPartitions bool           `json:"consumesAllPartitions"` // Whether the consumer group has at least one active offset for all partitions or not
	PartitionLags         []PartitionLag `json:"partitionLags"`
}

// PartitionLag describes the kafka lag for a partition for a single consumer group
type PartitionLag struct {
	PartitionID int32 `json:"partitionId"`
	Lag         int64 `json:"lag"`
}

// convertOffsets returns a map where the key is the topic name
func convertOffsets(offsets *sarama.OffsetFetchResponse) map[string]partitionOffsets {
	res := make(map[string]partitionOffsets, len(offsets.Blocks))
	for topic, blocks := range offsets.Blocks {
		pOffsets := make(partitionOffsets, len(blocks))
		for pID, block := range blocks {
			pOffsets[pID] = block.Offset
		}

		res[topic] = pOffsets
	}

	return res
}

// getConsumerGroupLags returns a nested map with the following key nestings: groupID -> topicName -> partitionID
func (s *Service) getConsumerGroupLags(ctx context.Context, groups []string) (map[string]*ConsumerGroupLag, error) {
	// 1. Fetch all Consumer Group Offsets for each Topic
	offsets, err := s.KafkaSvc.ListConsumerGroupOffsetsBulk(ctx, groups)
	if err != nil {
		s.Logger.Error("failed to list consumer group offsets in bulk", zap.Error(err))
		return nil, fmt.Errorf("failed to list consumer group offsets in bulk")
	}

	offsetsByGroup := make(map[string]map[string]partitionOffsets) // GroupID -> TopicName -> partitionOffsets
	for group, offset := range offsets {
		offsetsByGroup[group] = convertOffsets(offset)
	}

	// 2. Fetch all partition watermarks so that we can calculate the consumer group lags
	// Fetch all consumed topics and their partitions so that we know whose partitions we want the high water marks for
	topics := make([]string, 0)
	for _, topicOffset := range offsetsByGroup {
		for topic := range topicOffset {
			topics = append(topics, topic)
		}
	}

	topicPartitions := make(map[string][]int32, len(topics))
	for _, topic := range topics {
		partitions, err := s.KafkaSvc.Client.Partitions(topic)
		if err != nil {
			s.Logger.Error("failed to fetch partition list for calculating the group lags", zap.String("topic", topic), zap.Error(err))
			return nil, fmt.Errorf("failed to fetch partition list for calculating the group lags")
		}
		topicPartitions[topic] = partitions
	}

	waterMarks, err := s.KafkaSvc.HighWaterMarks(topicPartitions)
	if err != nil {
		return nil, err
	}

	// 4. Now that we've got all partition high water marks as well as the consumer group offsets we can calculate the lags
	res := make(map[string]*ConsumerGroupLag, len(groups))
	for _, group := range groups {
		topicLags := make([]*TopicLag, 0)
		for topic, partitionOffsets := range offsetsByGroup[group] {
			// In this scope we iterate on a single group's, single topic's offset
			subLogger := s.Logger.With(zap.String("group", group), zap.String("topic", topic))

			partitionWaterMarks, ok := waterMarks[topic]
			if !ok {
				subLogger.Error("no partition watermark for the group's topic available")
				return nil, fmt.Errorf("no partition watermark for the group's topic available")
			}

			// Take note, it's possible that a consumer group does not have active offsets for all topics, let's make that transparent
			// For this reason we rather iterate on the partition water marks than the group partition offsets.
			t := TopicLag{
				Topic:                 topic,
				SummedLag:             0,
				ConsumesAllPartitions: true,
				PartitionLags:         make([]PartitionLag, 0),
			}
			for pID, watermark := range partitionWaterMarks {
				groupOffset, ok := partitionOffsets[pID]
				if !ok {
					t.ConsumesAllPartitions = false
					continue
				}

				lag := watermark - groupOffset
				if lag < 0 {
					// If Watermark has been updated after we got the group offset lag could be negative, which ofc doesn't make sense
					lag = 0
				}
				t.SummedLag += lag
				t.PartitionLags = append(t.PartitionLags, PartitionLag{PartitionID: pID, Lag: lag})
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
