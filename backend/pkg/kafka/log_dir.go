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
	"context"
	"sort"
	"strings"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
	"golang.org/x/exp/slices"
)

// LogDirResponseSharded is a helper type that carries the sum of all log dir response shards.
type LogDirResponseSharded struct {
	LogDirResponses []LogDirResponse
	RequestsSent    int
	RequestsFailed  int
}

// LogDirResponse can have an error (if the broker failed to return data) or the actual LogDir response
type LogDirResponse struct {
	BrokerMetadata kgo.BrokerMetadata
	LogDirs        kmsg.DescribeLogDirsResponse
	Error          error
}

// DescribeLogDirs requests directory information for topic partitions. This request was added in KIP-113 and is
// included in Kafka 1.1.0+ releases.
//
// Use nil for topicPartitions to describe all topics and partitions.
func (s *Service) DescribeLogDirs(ctx context.Context, topicPartitions []kmsg.DescribeLogDirsRequestTopic) []LogDirResponse {
	req := kmsg.NewDescribeLogDirsRequest()
	req.Topics = topicPartitions
	shardedResp := s.KafkaClient.RequestSharded(ctx, &req)

	result := make([]LogDirResponse, 0, len(shardedResp))
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

		result = append(result, LogDirResponse{
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
