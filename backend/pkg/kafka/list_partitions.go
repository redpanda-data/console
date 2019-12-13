package kafka

import (
	"fmt"
)

// ListPartitions returns the partitionIDs for a given topic
func (s *Service) ListPartitions(topicName string) ([]int32, error) {
	partitions, err := s.Client.Partitions(topicName)
	if err != nil {
		return nil, fmt.Errorf("failed to get partitions for topic '%v': %v", topicName, err)
	}

	return partitions, nil
}
