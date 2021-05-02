package kafka

import (
	"context"
	"fmt"
	"sort"
)

// ListPartitionIDs returns the partitionIDs for a given topic
func (s *Service) ListPartitionIDs(ctx context.Context, topicName string) ([]int32, error) {
	metadata, err := s.GetSingleMetadata(ctx, topicName)
	if err != nil {
		return nil, fmt.Errorf("failed to get topic metadata: %w", err.Err)
	}

	partitions := metadata.Partitions
	partitionIDs := make([]int32, len(partitions))
	for i, partition := range partitions {
		partitionIDs[i] = partition.Partition
	}
	sort.Slice(partitionIDs, func(i, j int) bool { return partitionIDs[i] < partitionIDs[j] })

	return partitionIDs, nil
}
