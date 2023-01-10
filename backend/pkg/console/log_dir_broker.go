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

	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
)

// LogDirsByBroker is broker aggregated view for Kafka log dir information.
type LogDirsByBroker struct {
	BrokerMeta kgo.BrokerMetadata `json:"brokerMetadata"`
	Error      error              `json:"error"`

	LogDirs []LogDir `json:"logDirs"`

	// Meta stats
	TotalSizeBytes int64 `json:"totalSizeBytes"`
	TopicCount     int   `json:"topicCount"`
	PartitionCount int   `json:"partitionCount"`
}

// LogDir describes a directory (usually a disk drive on a broker) that stores
// partition log files (Kafka data).
type LogDir struct {
	Error          error         `json:"error"`
	AbsolutePath   string        `json:"absolutePath"`
	TotalSizeBytes int64         `json:"totalSizeBytes"`
	Topics         []LogDirTopic `json:"topics"`
	PartitionCount int           `json:"partitionCount"`
}

// LogDirTopic is the aggregated view for a Kafka topic.
type LogDirTopic struct {
	TopicName      string            `json:"topicName"`
	TotalSizeBytes int64             `json:"totalSizeBytes"`
	Partitions     []LogDirPartition `json:"partitions"`
}

// LogDirPartition is the log dir information for a single partition.
type LogDirPartition struct {
	PartitionID int32 `json:"partitionId"`
	OffsetLag   int64 `json:"offsetLag"`
	SizeBytes   int64 `json:"sizeBytes"`
}

// LogDirSizeByBroker returns a map where the BrokerID is the key and the summed bytes of all log dirs of
// the respective broker is the value.
func (s *Service) logDirsByBroker(ctx context.Context) (map[int32]LogDirsByBroker, error) {
	// 1. Describe log dirs for all topics, so that we can sum the size per broker
	responses := s.kafkaSvc.DescribeLogDirs(ctx, nil)

	result := make(map[int32]LogDirsByBroker)
	for _, response := range responses {
		brokerLogDirs := LogDirsByBroker{
			BrokerMeta:     response.BrokerMetadata,
			Error:          response.Error,
			TotalSizeBytes: 0,
			LogDirs:        nil,
			TopicCount:     0,
			PartitionCount: 0,
		}
		if response.Error != nil {
			result[response.BrokerMetadata.NodeID] = brokerLogDirs
			continue
		}

		brokerLogDirs.LogDirs = make([]LogDir, 0, len(response.LogDirs.Dirs))
		for _, dir := range response.LogDirs.Dirs {
			err := kerr.ErrorForCode(dir.ErrorCode)
			logDir := LogDir{
				Error:          err,
				AbsolutePath:   dir.Dir,
				TotalSizeBytes: 0,
				Topics:         nil,
				PartitionCount: 0,
			}
			if err != nil {
				brokerLogDirs.LogDirs = append(brokerLogDirs.LogDirs, logDir)
				continue
			}

			logDir.Topics = make([]LogDirTopic, len(dir.Topics))
			for i, topic := range dir.Topics {
				logDirTopic := LogDirTopic{
					TopicName:      topic.Topic,
					TotalSizeBytes: 0,
					Partitions:     make([]LogDirPartition, len(topic.Partitions)),
				}
				for j, partition := range topic.Partitions {
					logDirTopic.TotalSizeBytes += partition.Size
					logDirTopic.Partitions[j] = LogDirPartition{
						PartitionID: partition.Partition,
						OffsetLag:   partition.OffsetLag,
						SizeBytes:   partition.Size,
					}
				}
				logDir.Topics[i] = logDirTopic
				logDir.TotalSizeBytes += logDirTopic.TotalSizeBytes
				logDir.PartitionCount += len(logDirTopic.Partitions)
			}
			brokerLogDirs.LogDirs = append(brokerLogDirs.LogDirs, logDir)
			brokerLogDirs.TotalSizeBytes += logDir.TotalSizeBytes
			brokerLogDirs.TopicCount += len(logDir.Topics)
			brokerLogDirs.PartitionCount += logDir.PartitionCount
		}
		result[response.BrokerMetadata.NodeID] = brokerLogDirs
	}

	return result, nil
}
