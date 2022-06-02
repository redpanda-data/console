// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"fmt"

	"github.com/pkg/errors"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

type TopicLogDirSummary struct {
	TotalSizeBytes int64 `json:"totalSizeBytes"`

	ReplicaErrors []TopicLogDirSummaryReplicaError `json:"replicaErrors,omitempty"`

	// Hint is a descriptive message why the logDirSize could not be fetched or that it might be just an
	// estimate because one or more replicas did not respond to describe log dir request.
	Hint string `json:"hint,omitempty"`
}

type TopicLogDirSummaryReplicaError struct {
	BrokerID int32  `json:"brokerId"`
	Error    string `json:"error,omitempty"`
}

// LogDirSizeByTopic returns a map where the Topicname is the key. It returns the log dir size for each topic.
func (s *Service) logDirsByTopic(ctx context.Context, metadata *kmsg.MetadataResponse) map[string]TopicLogDirSummary {
	// 1. Construct log dir requests and collect all replica ids by partition so that we can later check whether we
	// successfully described all partition replicas.
	topicLogDirReqs := make([]kmsg.DescribeLogDirsRequestTopic, 0)
	replicaIDsByTopicPartition := make(map[string]map[int32][]int32)
	for _, topic := range metadata.Topics {
		topicErr := kerr.TypedErrorForCode(topic.ErrorCode)
		if topicErr != nil {
			// If there's an error on the topic level we won't have any partitions reported back
			continue
		}
		topicName := *topic.Topic
		replicaIDsByTopicPartition[topicName] = make(map[int32][]int32)

		req := kmsg.NewDescribeLogDirsRequestTopic()
		req.Topic = topicName
		req.Partitions = make([]int32, 0)
		for _, partition := range topic.Partitions {
			partitionID := partition.Partition
			req.Partitions = append(req.Partitions, partitionID)
			replicaIDsByTopicPartition[topicName][partitionID] = partition.Replicas
		}
		topicLogDirReqs = append(topicLogDirReqs, req)
	}

	responses := s.kafkaSvc.DescribeLogDirs(ctx, topicLogDirReqs)

	type partitionLogDir struct {
		PartitionID int32
		BrokerID    int32
		Size        int64
		Error       string
	}

	// 2. Collect all log dir information per partition replica
	// Map by topic name, by partition ID, by replica id
	partitionLogDirs := make(map[string]map[int32]map[int32]partitionLogDir)
	errorByBrokerID := make(map[int32]error)
	for _, res := range responses {
		brokerID := res.BrokerMetadata.NodeID
		if res.Error != nil {
			errorByBrokerID[brokerID] = res.Error
			continue
		}

		for _, logDir := range res.LogDirs.Dirs {
			err := kerr.ErrorForCode(logDir.ErrorCode)
			if err != nil {
				errorByBrokerID[brokerID] = errors.Wrap(err, "failed to inspect log dir")
				continue
			}

			for _, topic := range logDir.Topics {
				topicLogDir, exists := partitionLogDirs[topic.Topic]
				if !exists {
					topicLogDir = make(map[int32]map[int32]partitionLogDir)
				}
				for _, partition := range topic.Partitions {
					replicaDirs, exists := topicLogDir[partition.Partition]
					if !exists {
						replicaDirs = make(map[int32]partitionLogDir)
					}

					d := partitionLogDir{
						BrokerID:    res.BrokerMetadata.NodeID,
						PartitionID: partition.Partition,
						Size:        partition.Size,
					}
					replicaDirs[res.BrokerMetadata.NodeID] = d
					topicLogDir[partition.Partition] = replicaDirs
				}
				partitionLogDirs[topic.Topic] = topicLogDir
			}
		}
	}

	// 3. Iterate on all available topic partitions and their replicas to check for missing responses from partition
	// replicas. Enhance missing replica entries as needed.
	for _, topic := range metadata.Topics {
		topicName := *topic.Topic
		if _, exists := partitionLogDirs[topicName]; !exists {
			partitionLogDirs[topicName] = make(map[int32]map[int32]partitionLogDir)
		}

		for _, partition := range topic.Partitions {
			partitionID := partition.Partition
			if _, exists := partitionLogDirs[topicName][partitionID]; !exists {
				partitionLogDirs[topicName][partitionID] = make(map[int32]partitionLogDir)
			}

			for _, replicaID := range partition.Replicas {
				// Have we got a log dir response for this specific partition replica? If not we want to create a
				// dummy response that contains a proper error message for the requested replica.
				// Thus we first look up the per broker errors, but we also return a fallback message if we haven't
				// got an error/response back from the broker.
				if _, exists := partitionLogDirs[topicName][partitionID][replicaID]; !exists {
					err, errExists := errorByBrokerID[replicaID]
					if !errExists {
						// We should never run into this. We should always receive a proper error if responses are missing!
						err = fmt.Errorf("haven't got a log dir response for this replica even though it had been requested")
					}

					partitionLogDirs[topicName][partitionID][replicaID] = partitionLogDir{
						PartitionID: partitionID,
						BrokerID:    replicaID,
						Size:        -1,
						Error:       err.Error(),
					}
				}
			}
		}
	}

	// 4. Now we've got a log dir response or error for all partitions and their replicas. Let's aggregate these
	// now so that we can return it grouped by topic.
	result := make(map[string]TopicLogDirSummary)
	for topicName, topicLogDirs := range partitionLogDirs {
		errorsByReplicaID := make(map[int32]string)
		partitionsFailed := 0
		partitionsEstimated := 0
		topicSize := int64(0)

		for _, pLogDirs := range topicLogDirs {
			sizeByReplica := make(map[int32]int64)
			totalPartitionSize := int64(0)
			hasReplicaErrors := false

			for replicaID, rLogDir := range pLogDirs {
				if rLogDir.Error != "" {
					errorsByReplicaID[replicaID] = rLogDir.Error
					hasReplicaErrors = true
					continue
				}
				sizeByReplica[replicaID] = rLogDir.Size
				totalPartitionSize += rLogDir.Size
			}

			if len(sizeByReplica) == 0 {
				// We haven't got a single response for this partition, let's stop doing estimates at this point!
				partitionsFailed++
				continue
			}

			replicaCount := int64(len(pLogDirs))
			if hasReplicaErrors {
				// We have replica errors, but we've got a response from a replica. We'll use the largest replica size
				// to estimate the total partition size.
				largestReplicaSize := int64(0)
				for _, size := range sizeByReplica {
					if size > largestReplicaSize {
						largestReplicaSize = size
					}
				}
				estimatedSize := largestReplicaSize * replicaCount
				topicSize += estimatedSize
				partitionsEstimated++
				continue
			}

			// All replicas successfully responded, we know the correct size for this partition
			topicSize += totalPartitionSize
		}

		// Construct topic log dir summary
		hint := ""
		if partitionsFailed > 0 {
			hint = fmt.Sprintf("Topic size is unknown because the size of %d partitions is unknown", partitionsFailed)
		} else if partitionsEstimated > 0 {
			hint = fmt.Sprintf("Topic size is an estimate because the size of %d partitions was estimated", partitionsEstimated)
		}

		replicaErrors := make([]TopicLogDirSummaryReplicaError, 0)
		for replicaID, errMessage := range errorsByReplicaID {
			replicaErrors = append(replicaErrors, TopicLogDirSummaryReplicaError{
				BrokerID: replicaID,
				Error:    errMessage,
			})
		}

		result[topicName] = TopicLogDirSummary{
			TotalSizeBytes: topicSize,
			ReplicaErrors:  replicaErrors,
			Hint:           hint,
		}
	}

	return result
}
