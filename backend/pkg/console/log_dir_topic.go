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
	"errors"
	"fmt"
	"strings"

	"github.com/twmb/franz-go/pkg/kadm"
	"go.uber.org/zap"
)

// TopicLogDirSummary provides log dir / size information for a single topic. Because each broker
// provides the response for the data it owns for each topic, we may receive partial results.
type TopicLogDirSummary struct {
	TotalSizeBytes int64 `json:"totalSizeBytes"`

	ReplicaErrors []TopicLogDirSummaryReplicaError `json:"replicaErrors,omitempty"`

	// Hint is a descriptive message why the logDirSize could not be fetched or that it might be just an
	// estimate because one or more replicas did not respond to describe log dir request.
	Hint string `json:"hint,omitempty"`
}

// TopicLogDirSummaryReplicaError is an errored response for describing a broker's log dirs.
type TopicLogDirSummaryReplicaError struct {
	BrokerID int32  `json:"brokerId"`
	Error    string `json:"error,omitempty"`
}

type topicsSetWithLogDirs map[string]map[int32]partitionInfo

// Set adds or updates partitions for a topic to the topics set. If no partitions are
// added, this still creates the topic.
func (ts *topicsSetWithLogDirs) Set(t string, ps ...partitionInfo) {
	if *ts == nil {
		*ts = make(map[string]map[int32]partitionInfo)
	}
	existing := (*ts)[t]
	if existing == nil {
		existing = make(map[int32]partitionInfo, len(ps))
		(*ts)[t] = existing
	}
	for _, p := range ps {
		existing[p.PartitionID] = p
	}
}

// EachPartition calls fn for each partition in any directory.
func (ts topicsSetWithLogDirs) EachPartition(fn func(p partitionInfo)) {
	for _, d := range ts {
		for _, p := range d {
			fn(p)
		}
	}
}

// Lookup returns the specified partition if it exists.
func (ts topicsSetWithLogDirs) Lookup(t string, p int32) (partitionInfo, bool) {
	ps, exists := ts[t]
	if !exists {
		return partitionInfo{}, false
	}
	info, exists := ps[p]
	return info, exists
}

type partitionInfo struct {
	Topic               string
	PartitionID         int32
	Replicas            []int32
	ReplicaLogDirs      map[int32][]kadm.DescribedLogDirPartition
	ReplicaLogDirErrors map[int32][]kadm.DescribedLogDir
	OfflineReplicas     []int32
	InSyncReplicas      []int32
	Leader              int32
}

// EachReplicaLogDir calls fn for each partition log dir of any replica.
func (p partitionInfo) EachReplicaLogDir(fn func(dir kadm.DescribedLogDirPartition)) {
	for _, logDirs := range p.ReplicaLogDirs {
		for _, logDir := range logDirs {
			fn(logDir)
		}
	}
}

// Size returns the partition size. It de-duplicates shared logdirs, that were
// reported multiple times, so that they will only be considered once.
func (p partitionInfo) Size() int64 {
	totalPartitionSize := int64(0)

	// largestRemoteLogDir is used in case this partition is leaderless and therefore,
	// we are uncertain what reported remote log dir size we should use
	largestRemoteLogDir := int64(0)

	p.EachReplicaLogDir(func(dir kadm.DescribedLogDirPartition) {
		isSharedLogDir := strings.HasPrefix(dir.Dir, "remote://")

		if !isSharedLogDir {
			totalPartitionSize += dir.Size
			return
		}

		// Handle shared log dirs which are still duplicated. Shared log dirs are
		// reported by every replica in this partition. If possible, we want to report
		// the leader's size only, but partitions may be leaderless too.
		if dir.Size > largestRemoteLogDir {
			largestRemoteLogDir = dir.Size
		}

		isLeader := dir.Broker == p.Leader
		if isLeader {
			totalPartitionSize += dir.Size
		}
	})

	isLeaderlessPartition := p.Leader == -1
	if isLeaderlessPartition {
		totalPartitionSize += largestRemoteLogDir
	}

	return totalPartitionSize
}

// LogDirSizeByTopic returns a map where the topic name is the key.
// It returns the log dir size for each topic.
//
//nolint:gocognit,cyclop // Complexity is indeed high, but ideally this will be solved by changing the API response
func (s *Service) logDirsByTopic(ctx context.Context) (map[string]TopicLogDirSummary, error) {
	// 1. Retrieve metadata to know brokers hosting each replica.
	metadata, err := s.kafkaSvc.KafkaAdmClient.Metadata(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve metadata: %w", err)
	}

	// 2. Request log dirs from all brokers and deduplicate shared log dirs.
	shardErrors := make(map[int32]kadm.ShardError)
	describedLogDirs, err := s.kafkaSvc.KafkaAdmClient.DescribeAllLogDirs(ctx, nil)
	if err != nil {
		var se *kadm.ShardErrors
		if !errors.As(err, &se) {
			return nil, fmt.Errorf("failed to describe log dirs: %w", err)
		}

		if se.AllFailed {
			return nil, fmt.Errorf("failed to describe all log dirs: %w", err)
		}
		s.logger.Warn("failed to describe log dirs from some shards", zap.Int("failed_shards", len(se.Errs)))
		for _, shardErr := range se.Errs {
			s.logger.Warn("shard error for describing log dirs",
				zap.Int32("broker_id", shardErr.Broker.NodeID),
				zap.Error(shardErr.Err))
			shardErrors[shardErr.Broker.NodeID] = shardErr
		}
	}

	// 3. Because the described log dirs response may not report the size for every
	// individual partition we iterate by the reported metadata. To do so, we first
	// gather all the reported replica ids for each partition.
	topicsSet := topicsSetWithLogDirs{}
	metadata.Topics.EachPartition(func(detail kadm.PartitionDetail) {
		topicsSet.Set(detail.Topic, partitionInfo{
			Topic:       detail.Topic,
			PartitionID: detail.Partition,
			Replicas:    detail.Replicas,
			// ReplicaLogDirs will be filled later when iterating through all
			// broker log dirs. Each Replica must have at least one reported
			// log dir, otherwise we must assume there was an issue for this
			// broker - log dir combination.
			ReplicaLogDirs:      make(map[int32][]kadm.DescribedLogDirPartition),
			ReplicaLogDirErrors: make(map[int32][]kadm.DescribedLogDir),
			OfflineReplicas:     detail.OfflineReplicas,
			InSyncReplicas:      detail.ISR,
			Leader:              detail.Leader,
		})
	})

	// 4. Update partition info with reported log dirs and store log dir errors.
	erroredLogDirsByBrokerID := make(map[int32][]kadm.DescribedLogDir)
	describedLogDirs.Each(func(dir kadm.DescribedLogDir) {
		if dir.Err != nil {
			erroredLogDirsByBrokerID[dir.Broker] = append(erroredLogDirsByBrokerID[dir.Broker], dir)
			return
		}

		dir.Topics.Each(func(p kadm.DescribedLogDirPartition) {
			info, exists := topicsSet.Lookup(p.Topic, p.Partition)
			if !exists {
				return
			}
			info.ReplicaLogDirs[p.Broker] = append(info.ReplicaLogDirs[p.Broker], p)
			topicsSet.Set(p.Topic, info)
		})
	})

	// 5. Now we iterate through the metadata again to check whether we have a partition log
	// dir set for each replica. If we don't, we know something was missing in the DescribeLogDirs
	// response. This is important, because a missing log dir means we will most likely
	// report a wrong partition size.
	// We will also de-duplicate all shared/remote log dirs for each partition.
	topicsSet.EachPartition(func(p partitionInfo) {
		for _, replica := range p.Replicas {
			if _, exists := p.ReplicaLogDirs[replica]; exists {
				continue
			}

			// We don't have a log dir response for this replica.
			// This may be because we received an error when describing this log dir
			// or because we never received a response at all from this shard.
			if logDirErrors, exists := p.ReplicaLogDirErrors[replica]; exists {
				p.ReplicaLogDirErrors[replica] = logDirErrors
				return
			}

			// Populate returned shard error
			if shardErr, exists := shardErrors[replica]; exists {
				p.ReplicaLogDirErrors[replica] = append(p.ReplicaLogDirErrors[replica], kadm.DescribedLogDir{
					Broker: replica,
					Err:    fmt.Errorf("did not receive a log dir response for partition %d by replica with broker id %d: %w", p.PartitionID, replica, shardErr.Err),
				})
				return
			}

			// This should never happen, but in the unlikely case that we never retrieved any error
			// we will add a dummy error here.
			p.ReplicaLogDirErrors[replica] = append(p.ReplicaLogDirErrors[replica], kadm.DescribedLogDir{
				Broker: replica,
				Err:    fmt.Errorf("did not receive a log dir response for partition %d by replica with broker id %d", p.PartitionID, replica),
			})
		}
	})

	// 6. Now we've got a log dir response or error for all partitions and their replicas.
	// Let's aggregate these now so that we can return it grouped by topic.
	result := make(map[string]TopicLogDirSummary)
	for topicName, partitions := range topicsSet {
		errorsByReplicaID := make(map[int32]string)

		// FailedPartitions is the counter for partitions where at least
		// one log dir response from any replica is missing.
		failedPartitions := 0
		failedReplicas := 0
		topicSize := int64(0)

		for _, partition := range partitions {
			topicSize += partition.Size()

			if len(partition.ReplicaLogDirErrors) > 0 {
				failedPartitions++
			}
			missingReplicaLogDirs := len(partition.Replicas) - len(partition.ReplicaLogDirs)
			failedReplicas += missingReplicaLogDirs

			for _, logDirs := range partition.ReplicaLogDirErrors {
				for _, logDir := range logDirs {
					errorsByReplicaID[logDir.Broker] = logDir.Err.Error()
				}
			}
		}

		replicaErrors := make([]TopicLogDirSummaryReplicaError, 0)
		for brokerID, errMessage := range errorsByReplicaID {
			replicaErrors = append(replicaErrors, TopicLogDirSummaryReplicaError{
				BrokerID: brokerID,
				Error:    errMessage,
			})
		}

		hint := ""
		if failedPartitions > 0 {
			hint = fmt.Sprintf("The displayed topic size may not be accurate as log directory information from %d replicas across %d partitions is absent.", failedReplicas, failedPartitions)
		}
		result[topicName] = TopicLogDirSummary{
			TotalSizeBytes: topicSize,
			ReplicaErrors:  replicaErrors,
			Hint:           hint,
		}
	}

	return result, nil
}
