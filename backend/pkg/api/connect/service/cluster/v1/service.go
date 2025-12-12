// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package cluster contains all handlers for the internal cluster endpoints.
package cluster

import (
	"context"
	"log/slog"

	"connectrpc.com/connect"
	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/api/connect/service/common/v1"
	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/console"
	dataplanev1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/private/v1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/private/v1/privatev1connect"
)

var _ privatev1connect.ClusterServiceHandler = (*Service)(nil)

// Service that implements the ClusterServiceHandler interface.
type Service struct {
	cfg        *config.Config
	logger     *slog.Logger
	consoleSvc console.Servicer
}

func configSourceStringToProto(s string) dataplanev1.ConfigSource {
	mapper := &common.KafkaClientMapper{}
	if ksource, err := kmsg.ParseConfigSource(s); err == nil {
		if dsource, err := mapper.ConfigSourceToProto(ksource); err == nil {
			return dsource
		}
	}
	return dataplanev1.ConfigSource_CONFIG_SOURCE_UNSPECIFIED
}

func configTypeStringToProto(s string) dataplanev1.ConfigType {
	mapper := &common.KafkaClientMapper{}
	if ktype, err := kmsg.ParseConfigType(s); err == nil {
		if dtype, err := mapper.ConfigTypeToProto(ktype); err == nil {
			return dtype
		}
	}
	return dataplanev1.ConfigType_CONFIG_TYPE_UNSPECIFIED
}

// GetCluster returns cluster information.
func (s *Service) GetCluster(ctx context.Context, req *connect.Request[v1.GetClusterRequest]) (*connect.Response[v1.GetClusterResponse], error) {
	resp, err := s.consoleSvc.GetClusterInfo(ctx)
	if err != nil {
		return nil, err
	}

	var brokers []*v1.Broker
	for _, broker := range resp.Brokers {
		var configEntries []*v1.BrokerConfigEntry
		for _, cfg := range broker.Config.Configs {
			synonyms := make([]*dataplanev1.ConfigSynonym, len(cfg.Synonyms))
			for i, syn := range cfg.Synonyms {
				synonyms[i] = &dataplanev1.ConfigSynonym{
					Name:   syn.Name,
					Value:  syn.Value,
					Source: configSourceStringToProto(syn.Source),
				}
			}

			configEntries = append(configEntries, &v1.BrokerConfigEntry{
				Name:  cfg.Name,
				Value: cfg.Value,

				// TODO: after REST deprecation, stop converting config source/type to strings in GetClusterInfo
				Source:          configSourceStringToProto(cfg.Source),
				Type:            configTypeStringToProto(cfg.Type),
				IsExplicitlySet: cfg.IsExplicitlySet,
				IsDefaultValue:  cfg.IsDefaultValue,
				IsReadOnly:      cfg.IsReadOnly,
				IsSensitive:     cfg.IsSensitive,
				Documentation:   *cfg.Documentation,
				Synonyms:        synonyms,
			})
		}

		brokers = append(brokers, &v1.Broker{
			Id:         broker.BrokerID,
			LogDirSize: broker.LogDirSize,
			Address:    broker.Address,
			Rack:       broker.Rack,
			Config: &v1.BrokerConfig{
				Error:  broker.Config.Error,
				Values: configEntries,
			},
		})
	}

	return connect.NewResponse(&v1.GetClusterResponse{
		Cluster: &v1.Cluster{
			ControllerId: resp.ControllerID,
			KafkaVersion: resp.KafkaVersion,
			Brokers:      brokers,
		},
	}), nil
}

// NewService creates a new cluster service.
func NewService(cfg *config.Config,
	logger *slog.Logger,
	consoleSvc console.Servicer,
) *Service {
	return &Service{
		cfg:        cfg,
		logger:     logger,
		consoleSvc: consoleSvc,
	}
}
