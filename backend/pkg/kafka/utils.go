package kafka

import (
	"errors"
	"fmt"
	"math/rand"

	"github.com/Shopify/sarama"
)

func (s *Service) findAnyBroker() (*sarama.Broker, error) {
	brokers := s.Client.Brokers()
	if len(brokers) > 0 {
		index := rand.Intn(len(brokers))
		return brokers[index], nil
	}
	return nil, errors.New("no available broker")
}

type waterMark struct {
	Low  int64
	High int64
}

// todo: if it turns out that topicWaterMarks is not (or rarely) used other than for listing topics,
// we should merge it with this method so it can be optimized much better
func (s *Service) topicPartitions(topicName string, partitions []*sarama.PartitionMetadata) ([]TopicPartition, error) {

	// since go doesn't have enumerables/iterators...
	// Create array of partitionIDs
	partitionIDs := make([]int32, len(partitions))
	for i, p := range partitions {
		partitionIDs[i] = p.ID
	}

	// Get watermarks
	waterMarks, err := s.topicWaterMarks(topicName, partitionIDs)
	if err != nil {
		return nil, err
	}

	// Create result array
	topicPartitions := make([]TopicPartition, len(partitions))
	for i, p := range partitions {
		w := waterMarks[p.ID]
		topicPartitions[i] = TopicPartition{ID: p.ID, WaterMarkLow: w.Low, WaterMarkHigh: w.High}
	}

	return topicPartitions, nil
}

// topicWaterMarks returns a map of: partitionID -> WaterMark
func (s *Service) topicWaterMarks(topicName string, partitionIDs []int32) (map[int32]waterMark, error) {
	if s.Client.Closed() {
		return nil, fmt.Errorf("Could not get water marks for topic '%s' because sarama client is closed", topicName)
	}

	// getOffset refreshes topic metadata once to retry if Client.GetOffset fails
	// todo: we should have a custom error type here that lists both errors: the firstTry and the error while refreshing (or retrying)
	getOffset := func(partitionID int32, offset int64) (int64, error) {
		offset, errFirstTry := s.Client.GetOffset(topicName, partitionID, offset)
		if errFirstTry != nil {
			// Errors should only happen if metadata is out of date, so let's retry
			if errRefresh := s.Client.RefreshMetadata(topicName); errRefresh != nil {
				return 0, errRefresh // refresh failed
			}

			var errRetry error
			offset, errRetry = s.Client.GetOffset(topicName, partitionID, offset)
			if errRetry != nil {
				return 0, errRetry // retry failed
			}
		}

		return offset, nil
	}

	offsets := make(map[int32]waterMark, len(partitionIDs))

	for _, partitionID := range partitionIDs {

		// todo: do some golang research, figure out a way to avoid this insane syntax; this loop could be much shorter...
		low, err := getOffset(partitionID, sarama.OffsetOldest)
		if err != nil {
			return nil, err
		}
		high, err := getOffset(partitionID, sarama.OffsetNewest)
		if err != nil {
			return nil, err
		}

		offsets[partitionID] = waterMark{low, high}
	}

	return offsets, nil
}
