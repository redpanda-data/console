// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafka

import (
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// PartitionsToPartitionIDs extracts the partitionIDs from the metadata response struct we receive
// from kafka after requesting the metadata.
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
