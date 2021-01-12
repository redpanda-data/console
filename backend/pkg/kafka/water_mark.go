package kafka

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kerr"
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
	Low         int64
	High        int64
}

// TopicPartitionOffset is a map of Topicnames -> PartitionIDs -> Offset
type TopicPartitionOffsets = map[string]map[int32]int64

// GetPartitionMarks returns a map of: partitionID -> PartitionMarks
func (s *Service) GetPartitionMarks(ctx context.Context, topic string, partitionIDs []int32) (map[int32]PartitionMarks, error) {
	// 1. Create topic partitions map that can be passed to the ListOffsets request
	topicPartitions := make(map[string][]int32)
	topicPartitions[topic] = partitionIDs

	// 2. Send low & high watermark request in parallel
	g, ctx := errgroup.WithContext(ctx)

	var lowWaterMarks TopicPartitionOffsets
	var highWaterMarks TopicPartitionOffsets
	g.Go(func() error {
		oldestOffsets, err := s.ListOffsets(ctx, topicPartitions, TimestampEarliest)
		if err != nil {
			return err
		}
		lowWaterMarks = oldestOffsets
		return nil
	})
	g.Go(func() error {
		latestOffsets, err := s.ListOffsets(ctx, topicPartitions, TimestampLatest)
		if err != nil {
			return err
		}
		highWaterMarks = latestOffsets
		return nil
	})

	err := g.Wait()
	if err != nil {
		s.Logger.Error("failed to request partition marks", zap.String("topic", topic), zap.Error(err))
		return nil, fmt.Errorf("failed to request PartitionMarks: %w", err)
	}

	result := make(map[int32]PartitionMarks, len(partitionIDs))
	for _, id := range partitionIDs {
		result[id] = PartitionMarks{
			PartitionID: id,
			Low:         lowWaterMarks[topic][id],
			High:        highWaterMarks[topic][id],
		}
	}

	return result, nil
}

// ListOffsets returns a nested map of: topic -> partitionID -> high water mark offset of all available partitions
func (s *Service) ListOffsets(ctx context.Context, topicPartitions map[string][]int32, timestamp int64) (TopicPartitionOffsets, error) {
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
		topicReq := kmsg.ListOffsetsRequestTopic{
			Topic:      topic,
			Partitions: partitionRequests,
		}
		topicRequests = append(topicRequests, topicReq)
	}

	req := kmsg.ListOffsetsRequest{
		Topics: topicRequests,
	}
	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		s.Logger.Error("failed to request high watermarks", zap.Error(err))
		return nil, fmt.Errorf("failed to request high watermarks: %w", err)
	}

	watermarkByTopicByPartitionID := make(map[string]map[int32]int64)
	for _, topic := range res.Topics {
		if _, ok := watermarkByTopicByPartitionID[topic.Topic]; !ok {
			watermarkByTopicByPartitionID[topic.Topic] = make(map[int32]int64)
		}
		for _, partition := range topic.Partitions {
			err := kerr.ErrorForCode(partition.ErrorCode)
			if err != nil {
				s.Logger.Error("failed to request high water mark",
					zap.String("topic", topic.Topic),
					zap.Int32("partition", partition.Partition),
					zap.Error(err))
				return nil, fmt.Errorf("failed to request high watermark for topic: '%v', partition '%v'", topic.Topic, partition.Partition)
			}
			watermarkByTopicByPartitionID[topic.Topic][partition.Partition] = partition.Offset
		}
	}

	return watermarkByTopicByPartitionID, nil
}
