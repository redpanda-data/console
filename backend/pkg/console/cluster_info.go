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
	"sort"
	"time"

	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
)

const unknownVersion = "unknown"

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
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}

	eg, egCtx := errgroup.WithContext(ctx)

	var logDirsByBroker map[int32]LogDirsByBroker
	var metadata *kmsg.MetadataResponse
	var configsByBrokerID map[int32]BrokerConfig
	kafkaVersion := unknownVersion

	// We use a child context with a shorter timeout because otherwise we'll potentially have very long response
	// times in case of a single broker being down.
	childCtx, cancel := context.WithTimeout(egCtx, 6*time.Second)
	defer cancel()

	eg.Go(func() error {
		logDirsByBroker = s.logDirsByBroker(childCtx, cl)
		return nil
	})

	eg.Go(func() error {
		var err error
		req := kmsg.NewMetadataRequest()
		metadata, err = req.RequestWith(childCtx, cl)
		if err != nil {
			return err
		}
		return nil
	})

	eg.Go(func() error {
		var err error

		// Try to get cluster version via Redpanda Admin API.
		if s.cfg.Redpanda.AdminAPI.Enabled {
			adminAPICl, err := s.redpandaClientFactory.GetRedpandaAPIClient(ctx)
			if err != nil {
				s.logger.Warn("failed to retrieve redpanda admin api client to retrieve cluster version", zap.Error(err))
				return nil
			}

			kafkaVersion, err = s.redpandaClusterVersion(childCtx, adminAPICl)
			if err != nil { //nolint:revive // error check first
				s.logger.Warn("failed to retrieve cluster version via redpanda admin api", zap.Error(err))
			} else {
				return nil
			}
		}

		// If Redpanda Admin API failed or not available, try to get cluster version via Kafka API.
		kafkaVersion, err = s.GetKafkaVersion(childCtx)
		if err != nil {
			s.logger.Warn("failed to request kafka version via Kafka API", zap.Error(err))
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
