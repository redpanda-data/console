package owl

import "fmt"

// TopicPartition consists of some (not all) information about a partition of a topic.
// Only data relevant to the 'partition table' in the frontend is included.
type TopicPartition struct {
	ID            int32 `json:"id"`
	WaterMarkLow  int64 `json:"waterMarkLow"`
	WaterMarkHigh int64 `json:"waterMarkHigh"`
}

// ListTopicPartitions returns the partition in the topic along with their watermarks
func (s *Service) ListTopicPartitions(topicName string) ([]TopicPartition, error) {
	_, isBlacklisted := s.topicsBlacklist[topicName]
	if isBlacklisted {
		return nil, fmt.Errorf("cannot list partitions of blacklisted topic %v", topicName)
	}

	partitions, err := s.kafkaSvc.ListPartitions(topicName)
	if err != nil {
		return nil, fmt.Errorf("failed to get partitions for topic '%v': %v", topicName, err)
	}

	// Get watermarks
	waterMarks, err := s.kafkaSvc.WaterMarks(topicName, partitions)
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
