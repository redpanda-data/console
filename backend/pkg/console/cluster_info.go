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
	"sort"
	"time"

	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
	"github.com/twmb/franz-go/pkg/kversion"
	"go.uber.org/zap"

	"golang.org/x/sync/errgroup"
)

// ClusterInfo describes the brokers in a cluster
type ClusterInfo struct {
	ControllerID int32     `json:"controllerId"`
	Brokers      []*Broker `json:"brokers"`
	KafkaVersion string    `json:"kafkaVersion"`
}

// Broker described by some basic broker properties
type Broker struct {
	BrokerID   int32        `json:"brokerId"`
	LogDirSize int64        `json:"logDirSize"`
	Address    string       `json:"address"`
	Rack       *string      `json:"rack"`
	Config     BrokerConfig `json:"config"`
}

// GetClusterInfo returns generic information about all brokers in a Kafka cluster and returns them
func (s *Service) GetClusterInfo(ctx context.Context) (*ClusterInfo, error) {
	eg, _ := errgroup.WithContext(ctx)

	var logDirsByBroker map[int32]LogDirsByBroker
	var metadata *kmsg.MetadataResponse
	var configsByBrokerID map[int32]BrokerConfig
	kafkaVersion := "unknown"

	// We use a child context with a shorter timeout because otherwise we'll potentially have very long response
	// times in case of a single broker being down.
	childCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()

	eg.Go(func() error {
		var err error
		logDirsByBroker, err = s.logDirsByBroker(childCtx)
		if err != nil {
			s.logger.Warn("failed to request brokers log dirs", zap.Error(err))
		}
		return nil
	})

	eg.Go(func() error {
		var err error
		metadata, err = s.kafkaSvc.GetMetadata(childCtx, nil)
		if err != nil {
			return err
		}
		return nil
	})

	eg.Go(func() error {
		var err error

		// Try to get cluster version via Redpanda Admin API.
		if s.redpandaSvc != nil {
			kafkaVersion, err = s.redpandaSvc.GetClusterVersion(childCtx)
			if err == nil {
				return nil
			}
		}

		// If Redpanda Admin API failed or not available, try to get cluster version via Kafka API.
		kafkaVersion, err = s.GetKafkaVersion(childCtx)
		if err != nil {
			s.logger.Warn("failed to request kafka version", zap.Error(err))
		}

		return nil
	})

	eg.Go(func() error {
		var err error
		configsByBrokerID, err = s.GetAllBrokerConfigs(childCtx)
		if err != nil {
			s.logger.Warn("failed to request broker configs", zap.Error(err))
		}
		return nil
	})
	if err := eg.Wait(); err != nil {
		return nil, err
	}

	brokers := make([]*Broker, len(metadata.Brokers))
	for i, broker := range metadata.Brokers {
		size := int64(-1)
		if value, ok := logDirsByBroker[broker.NodeID]; ok {
			size = value.TotalSizeBytes
		}

		var brokerCfg BrokerConfig
		if value, ok := configsByBrokerID[broker.NodeID]; ok {
			brokerCfg = value
		}

		brokers[i] = &Broker{
			BrokerID:   broker.NodeID,
			LogDirSize: size,
			Address:    broker.Host,
			Rack:       broker.Rack,
			Config:     brokerCfg,
		}
	}
	sort.Slice(brokers, func(i, j int) bool {
		return brokers[i].BrokerID < brokers[j].BrokerID
	})

	return &ClusterInfo{
		ControllerID: metadata.ControllerID,
		Brokers:      brokers,
		KafkaVersion: kafkaVersion,
	}, nil
}

func (s *Service) GetKafkaVersion(ctx context.Context) (string, error) {
	apiVersions, err := s.kafkaSvc.GetAPIVersions(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to request api versions: %w", err)
	}

	err = kerr.ErrorForCode(apiVersions.ErrorCode)
	if err != nil {
		return "", fmt.Errorf("failed to request api versions. Inner Kafka error: %w", err)
	}

	versions := kversion.FromApiVersionsResponse(apiVersions)

	return versions.VersionGuess(), nil
}
