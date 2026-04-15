// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package broker contains all handlers for the Broker endpoints.
package broker

import (
	"context"
	"log/slog"

	"connectrpc.com/connect"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/console"
	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
)

var _ dataplanev1connect.BrokerServiceHandler = (*Service)(nil)

// Service implements the handlers for Broker endpoints.
type Service struct {
	logger     *slog.Logger
	consoleSvc console.Servicer
}

// NewService creates a new Broker service handler.
func NewService(
	logger *slog.Logger,
	consoleSvc console.Servicer,
) *Service {
	return &Service{
		logger:     logger,
		consoleSvc: consoleSvc,
	}
}

// GetBrokerConfig returns configuration entries for a specific broker.
func (s *Service) GetBrokerConfig(ctx context.Context, req *connect.Request[v1.GetBrokerConfigRequest]) (*connect.Response[v1.GetBrokerConfigResponse], error) {
	cfgs, restErr := s.consoleSvc.GetBrokerConfig(ctx, req.Msg.GetBrokerId())
	if restErr != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			restErr.Err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String()),
		)
	}

	protoCfgs := make([]*v1.GetBrokerConfigResponse_BrokerConfig, 0, len(cfgs))
	for _, cfg := range cfgs {
		synonyms := make([]*v1.GetBrokerConfigResponse_BrokerConfig_ConfigSynonym, 0, len(cfg.Synonyms))
		for _, syn := range cfg.Synonyms {
			synonyms = append(synonyms, &v1.GetBrokerConfigResponse_BrokerConfig_ConfigSynonym{
				Name:   syn.Name,
				Value:  syn.Value,
				Source: syn.Source,
			})
		}

		protoCfgs = append(protoCfgs, &v1.GetBrokerConfigResponse_BrokerConfig{
			Name:            cfg.Name,
			Value:           cfg.Value,
			Source:          cfg.Source,
			Type:            cfg.Type,
			IsExplicitlySet: cfg.IsExplicitlySet,
			IsDefaultValue:  cfg.IsDefaultValue,
			IsReadOnly:      cfg.IsReadOnly,
			IsSensitive:     cfg.IsSensitive,
			Synonyms:        synonyms,
		})
	}

	return connect.NewResponse(&v1.GetBrokerConfigResponse{Configs: protoCfgs}), nil
}
