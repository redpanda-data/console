// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package monitoring contains all handlers for the monitoring endpoints
package monitoring

import (
	"context"
	"log/slog"

	adminv2 "buf.build/gen/go/redpandadata/core/protocolbuffers/go/redpanda/core/admin/v2"
	"connectrpc.com/connect"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	redpandafactory "github.com/redpanda-data/console/backend/pkg/factory/redpanda"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
)

var _ dataplanev1connect.MonitoringServiceHandler = (*Service)(nil)

// Service implements MonitoringServiceHandler
type Service struct {
	cfg                   *config.Config
	logger                *slog.Logger
	redpandaClientFactory redpandafactory.ClientFactory
}

// NewService instantiates a new monitoring Service
func NewService(cfg *config.Config, logger *slog.Logger, redpandaClientFactory redpandafactory.ClientFactory) *Service {
	return &Service{cfg: cfg, logger: logger, redpandaClientFactory: redpandaClientFactory}
}

// ListKafkaConnections proxies requests to the adminv2 ListKafkaConnections rpc
func (s *Service) ListKafkaConnections(ctx context.Context, req *connect.Request[adminv2.ListKafkaConnectionsRequest]) (*connect.Response[adminv2.ListKafkaConnectionsResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	adminClient, err := s.redpandaClientFactory.GetRedpandaAPIClient(ctx)
	if err != nil {
		return nil, err
	}

	resp, err := adminClient.ClusterService().ListKafkaConnections(ctx, req)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "")
	}

	return &connect.Response[adminv2.ListKafkaConnectionsResponse]{Msg: resp.Msg}, nil
}
