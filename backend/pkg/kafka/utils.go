package kafka

import (
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

func (s *Service) PartitionsToPartitionIDs(partitions []kmsg.MetadataResponseTopicPartition) ([]int32, error) {
	var firstErr error

	partitionIDs := make([]int32, len(partitions))
	for i, partition := range partitions {
		err := kerr.ErrorForCode(partition.ErrorCode)
		if err != nil && firstErr == nil {
			firstErr = err
		} else {
			partitionIDs[i] = partition.Partition
		}
	}

	return partitionIDs, firstErr
}
