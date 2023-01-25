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

	"github.com/twmb/franz-go/pkg/kmsg"
	"golang.org/x/sync/errgroup"
)

// BrokerWithConfigAndStorage described by some basic broker properties
type BrokerWithConfigAndStorage struct {
	BrokerID int32 `json:"brokerId"`
	// TotalLogDirSizeBytes is the total sum of bytes that is returned via the
	// DescribeLogDirs API. Thus, this also includes replicas stored on that
	// broker. If we fail to retrieve the storage for this broker this
	// will be nil.
	TotalLogDirSizeBytes *int64  `json:"totalLogDirSizeBytes,omitempty"`
	Address              string  `json:"address,omitempty"`
	Rack                 *string `json:"rack,omitempty"`
}

// GetBrokersWithConfigAndStorage returns a slice of all brokers in a cluster along with
// their metadata, storage and configs. If we fail to get metadata from the cluster
// this function will return an error.
func (s *Service) GetBrokersWithConfigAndStorage(ctx context.Context) ([]BrokerWithConfigAndStorage, error) {
	// We use a child context with a shorter timeout because otherwise we'll potentially have very long response
	// times in case of a single broker being down.
	childCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()

	var logDirsByBroker map[int32]LogDirsByBroker
	var metadata *kmsg.MetadataResponse

	eg, grpCtx := errgroup.WithContext(childCtx)
	eg.Go(func() error {
		logDirsByBroker = s.logDirsByBroker(grpCtx)
		return nil
	})

	eg.Go(func() error {
		var err error
		metadata, err = s.kafkaSvc.GetMetadata(childCtx, nil)
		if err != nil {
			return fmt.Errorf("failed to get metadata from cluster: %w", err)
		}
		return nil
	})

	if err := eg.Wait(); err != nil {
		return nil, err
	}

	brokers := make([]BrokerWithConfigAndStorage, len(metadata.Brokers))
	for i, broker := range metadata.Brokers {
		var size *int64
		if value, ok := logDirsByBroker[broker.NodeID]; ok {
			size = &value.TotalSizeBytes
		}

		brokers[i] = BrokerWithConfigAndStorage{
			BrokerID:             broker.NodeID,
			TotalLogDirSizeBytes: size,
			Address:              broker.Host,
			Rack:                 broker.Rack,
		}
	}
	sort.Slice(brokers, func(i, j int) bool {
		return brokers[i].BrokerID < brokers[j].BrokerID
	})

	return brokers, nil
}
