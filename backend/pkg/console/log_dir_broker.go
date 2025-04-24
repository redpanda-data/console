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
	"slices"
	"sort"
	"strings"

	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
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

// logDirsByBroker returns a map where the BrokerID is the key and the summed bytes of all log dirs of
// the respective broker is the value.
func (s *Service) logDirsByBroker(ctx context.Context, cl *kgo.Client) map[int32]LogDirsByBroker {
	// 1. Describe log dirs for all topics, so that we can sum the size per broker
	responses := s.describeLogDirs(ctx, cl, nil)

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

	return result
}

// logDirResponse can have an error (if the broker failed to return data) or the actual LogDir response
type logDirResponse struct {
	BrokerMetadata kgo.BrokerMetadata
	LogDirs        kmsg.DescribeLogDirsResponse
	Error          error
}

// describeLogDirs requests directory information for topic partitions. This request was added in KIP-113 and is
// included in Kafka 1.1.0+ releases.
//
// Use nil for topicPartitions to describe all topics and partitions.
func (*Service) describeLogDirs(ctx context.Context, cl *kgo.Client, topicPartitions []kmsg.DescribeLogDirsRequestTopic) []logDirResponse {
	req := kmsg.NewDescribeLogDirsRequest()
	req.Topics = topicPartitions
	shardedResp := cl.RequestSharded(ctx, &req)

	result := make([]logDirResponse, 0, len(shardedResp))
	sharedLogDirs := make([]kmsg.DescribeLogDirsResponseDir, 0)

	// Collect all shared log dirs
	for _, kresp := range shardedResp {
		res, ok := kresp.Resp.(*kmsg.DescribeLogDirsResponse)
		if !ok {
			res = &kmsg.DescribeLogDirsResponse{}
		}

		// Strip all remote/shared dirs, but keep local dirs in response
		// The shared dirs will be unified and then returned by a single broker once.
		localDirs := make([]kmsg.DescribeLogDirsResponseDir, 0, len(res.Dirs))
		for _, dir := range res.Dirs {
			if strings.HasPrefix(dir.Dir, "remote://") {
				sharedLogDirs = append(sharedLogDirs, dir)
				continue
			}
			localDirs = append(localDirs, dir)
		}
		res.Dirs = localDirs

		result = append(result, logDirResponse{
			BrokerMetadata: kresp.Meta,
			LogDirs:        *res,
			Error:          kresp.Err,
		})
	}

	// unify/de-dupe all shared log dirs and mount them to the first response
	if len(sharedLogDirs) > 0 && len(result) > 0 {
		unifiedLogDirs := unifyLogDirs(sharedLogDirs)
		firstEntry := result[0]
		firstEntry.LogDirs.Dirs = append(firstEntry.LogDirs.Dirs, unifiedLogDirs...)
		result[0] = firstEntry
	}

	return result
}

// unifyLogDirs accepts multiple log dirs and merges it into
// a single log dir. This is used for shared/remote log dirs, that
// is reported by multiple brokers. Because each broker may only own
// a subset of the data that is hosted in the log dir, the responses
// of the brokers will be inconsistent and incomplete.
// At least one log dir must be passed into this function.
//
// Because you may have more than one remote dir, this function
// will return a slice of log dirs as well.
func unifyLogDirs(logDirs []kmsg.DescribeLogDirsResponseDir) []kmsg.DescribeLogDirsResponseDir {
	if len(logDirs) == 0 {
		return nil
	}

	// Find the maximum reported size for each unique log dir partition.
	// Some brokers may report a smaller size if they are lagging
	// behind (e.g. after a recovery).
	sizeByDirTopicPartition := make(map[string]map[string]map[int32]int64)
	for _, dir := range logDirs {
		if _, exists := sizeByDirTopicPartition[dir.Dir]; !exists {
			sizeByDirTopicPartition[dir.Dir] = make(map[string]map[int32]int64)
		}

		for _, topic := range dir.Topics {
			if _, exists := sizeByDirTopicPartition[dir.Dir][topic.Topic]; !exists {
				sizeByDirTopicPartition[dir.Dir][topic.Topic] = make(map[int32]int64)
			}

			for _, partition := range topic.Partitions {
				if sizeByDirTopicPartition[dir.Dir][topic.Topic][partition.Partition] < partition.Size {
					sizeByDirTopicPartition[dir.Dir][topic.Topic][partition.Partition] = partition.Size
				}
			}
		}
	}

	// Create one final log dir for each found log dir
	unifiedLogDirs := make([]kmsg.DescribeLogDirsResponseDir, 0, len(sizeByDirTopicPartition))
	for dir, topics := range sizeByDirTopicPartition {
		logDirTopics := make([]kmsg.DescribeLogDirsResponseDirTopic, 0)
		for topic, partitions := range topics {
			logDirPartitions := make([]kmsg.DescribeLogDirsResponseDirTopicPartition, 0)
			for partitionID, size := range partitions {
				logDirPartitions = append(logDirPartitions, kmsg.DescribeLogDirsResponseDirTopicPartition{
					Partition: partitionID,
					Size:      size,
				})
			}
			slices.SortFunc(logDirPartitions, func(a, b kmsg.DescribeLogDirsResponseDirTopicPartition) int {
				return int(a.Partition - b.Partition)
			})

			logDirTopics = append(logDirTopics, kmsg.DescribeLogDirsResponseDirTopic{
				Topic:      topic,
				Partitions: logDirPartitions,
			})
		}
		sort.Slice(logDirTopics, func(i, j int) bool {
			return logDirTopics[i].Topic < logDirTopics[j].Topic
		})

		unifiedLogDirs = append(unifiedLogDirs, kmsg.DescribeLogDirsResponseDir{
			Dir:    dir,
			Topics: logDirTopics,
		})
	}

	return unifiedLogDirs
}
