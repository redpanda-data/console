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
	// Error indicates whether there was an issue fetching the watermarks for this partition.
	Error string

	Low  int64
	High int64
}

// GetPartitionMarks returns a map of: partitionID -> PartitionMarks
func (s *Service) GetPartitionMarksBulk(ctx context.Context, topicPartitions map[string][]int32) (map[string]map[int32]*PartitionMarks, error) {
	// Send low & high watermark request in parallel
	g, ctx := errgroup.WithContext(ctx)

	var lowWaterMarks *kmsg.ListOffsetsResponse
	var highWaterMarks *kmsg.ListOffsetsResponse
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
				Error:       "",
				Low:         -1, // -1 indicates that this offset has not yet been loaded
				High:        -1, // -1 indicates that this offset has not yet been loaded
			}
		}
	}

	// Iterate on all low watermarks and put the partial information into the result map
	for _, topic := range lowWaterMarks.Topics {
		for _, partition := range topic.Partitions {
			err := kerr.TypedErrorForCode(partition.ErrorCode)
			if err != nil {
				result[topic.Topic][partition.Partition].Error = err.Error()
				continue
			}
			result[topic.Topic][partition.Partition].Low = partition.Offset
		}
	}

	// Enrich the partial information with the high water mark offsets. This loop is slightly different because
	// we check for existing errors and skip that.
	for _, topic := range highWaterMarks.Topics {
		for _, partition := range topic.Partitions {
			err := kerr.TypedErrorForCode(partition.ErrorCode)
			if err != nil {
				result[topic.Topic][partition.Partition].Error = err.Error()
				continue
			}
			result[topic.Topic][partition.Partition].High = partition.Offset
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

// ListOffsets returns a nested map of: topic -> partitionID -> high water mark offset of all available partitions
func (s *Service) ListOffsets(ctx context.Context, topicPartitions map[string][]int32, timestamp int64) (*kmsg.ListOffsetsResponse, error) {
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
	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		s.Logger.Error("failed to request topic offsets", zap.Error(err))
		return nil, fmt.Errorf("failed to request topic offsets: %w", err)
	}

	return res, nil
}
