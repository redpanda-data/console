// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"fmt"
	"sort"
	"time"

	"go.uber.org/zap"
)

// BrokerWithLogDirs described by some basic broker properties
type BrokerWithLogDirs struct {
	BrokerID     int32   `json:"brokerId"`
	IsController bool    `json:"isController"`
	Address      string  `json:"address,omitempty"`
	Rack         *string `json:"rack,omitempty"`

	// TotalLogDirSizeBytes is the total sum of bytes that is returned via the
	// DescribeLogDirs API. Thus, this also includes replicas stored on that
	// broker. If we fail to retrieve the storage for this broker this
	// will be nil.
	TotalLogDirSizeBytes *int64 `json:"totalLogDirSizeBytes,omitempty"`
	// TotalPrimaryLogDirSizeBytes is the log dir size of the unique/leading partitions only.
	// It represents the data size without replication.
	TotalPrimaryLogDirSizeBytes *int64 `json:"totalPrimaryLogDirSizeBytes,omitempty"`
}

// GetBrokersWithLogDirs returns a slice of all brokers in a cluster along with
// their metadata, storage and configs. If we fail to get metadata from the cluster
// this function will return an error.
//
//nolint:gocognit // Breaking it up would make it harder to comprehend; currently seems still okayish.
func (s *Service) GetBrokersWithLogDirs(ctx context.Context) ([]BrokerWithLogDirs, error) {
	metadata, err := s.kafkaSvc.KafkaAdmClient.Metadata(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get metadata from cluster: %w", err)
	}

	// Create a map that informs us what broker is the primary broker for each partition
	// so that we can calculate the replicated versus primary bytes afterwards
	type partitionID = int32
	type nodeID = int32
	type topic = string
	partitionLeader := make(map[topic]map[partitionID]nodeID)
	for _, t := range metadata.Topics {
		if t.Err != nil {
			continue
		}
		partitionLeader[t.Topic] = make(map[partitionID]nodeID)
		for _, p := range t.Partitions {
			if p.Err != nil {
				continue
			}
			partitionLeader[t.Topic][p.Partition] = p.Leader
		}
	}

	// We use a child context with a shorter timeout because otherwise we'll potentially have very long response
	// times in case of a single broker being down.
	childCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()

	describedLogDirs, err := s.kafkaSvc.KafkaAdmClient.DescribeAllLogDirs(childCtx, nil)
	if err != nil {
		// When an error is set we still receive a partial response from the admin client.
		// Also, describing broker log dirs is not considered mandatory for serving a
		// response here.
		s.logger.Warn("describing broker log dirs returned an error for one or more shards", zap.Error(err))
	}

	sortedLogDirs := describedLogDirs.Sorted()
	primaryBytesByNodeID := make(map[int32]int64)
	totalBytesByNodeID := make(map[int32]int64)
	for _, logDir := range sortedLogDirs {
		if logDir.Err != nil {
			s.logger.Warn("failed to described this broker's log dir",
				zap.Int32("broker_id", logDir.Broker),
				zap.String("log_dir", logDir.Dir),
				zap.Error(logDir.Err))
			continue
		}

		for topicName, t := range logDir.Topics {
			for pID, p := range t {
				// Check if this LogDir stores the primary bytes for the given partition
				leaderID, exists := partitionLeader[topicName][pID]
				if exists {
					if logDir.Broker == leaderID {
						primaryBytesByNodeID[logDir.Broker] += p.Size
						continue
					}
				}
			}
		}
		totalBytesByNodeID[logDir.Broker] += logDir.Size()
	}

	brokers := make([]BrokerWithLogDirs, len(metadata.Brokers))
	for i, metadataBroker := range metadata.Brokers {
		// The individual log dir responses may have failed, hence these are nullable
		var primaryBytes *int64
		var totalBytes *int64
		if p, exists := primaryBytesByNodeID[metadataBroker.NodeID]; exists {
			primaryBytes = &p
		}
		if t, exists := totalBytesByNodeID[metadataBroker.NodeID]; exists {
			totalBytes = &t
		}

		brokers[i] = BrokerWithLogDirs{
			BrokerID:     metadataBroker.NodeID,
			IsController: metadata.Controller == metadataBroker.NodeID,
			Address:      metadataBroker.Host,
			Rack:         metadataBroker.Rack,
			// Storage properties will be set later
			TotalLogDirSizeBytes:        totalBytes,
			TotalPrimaryLogDirSizeBytes: primaryBytes,
		}
	}

	sort.Slice(brokers, func(i, j int) bool {
		return brokers[i].BrokerID < brokers[j].BrokerID
	})

	return brokers, nil
}
