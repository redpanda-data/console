package kafka

import (
	"fmt"
)

// TopicPartition consists of some (not all) information about a partition of a topic.
// Only data relevant to the 'partition table' in the frontend is included.
// **This struct is passed around by-value since it is still small enough (and allocations+gc would hurt more than help)**
type TopicPartition struct {
	ID            int32 `json:"id"`
	WaterMarkLow  int64 `json:"waterMarkLow"`
	WaterMarkHigh int64 `json:"waterMarkHigh"`
}

// ListTopicPartitions returns the partition in the topic along with their watermarks
func (s *Service) ListTopicPartitions(topicName string) ([]TopicPartition, error) {
	partitions, err := s.Client.Partitions(topicName)
	if err != nil {
		return nil, fmt.Errorf("failed to get partitions for topic '%v': %v", topicName, err)
	}

	// Get watermarks
	waterMarks, err := s.waterMarks(topicName, partitions)
	if err != nil {
		return nil, err
	}

	// Create result array
	topicPartitions := make([]TopicPartition, len(partitions))
	for i, p := range waterMarks {
		w := waterMarks[p.PartitionID]
		topicPartitions[i] = TopicPartition{ID: p.PartitionID, WaterMarkLow: w.Low, WaterMarkHigh: w.High}
	}

	return topicPartitions, nil
}
