// Copyright 2023 Redpanda Data, Inc.
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

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/console"
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

// GetCluster returns cluster information.
func (s *Service) GetCluster(ctx context.Context, req *connect.Request[v1.GetClusterRequest]) (*connect.Response[v1.GetClusterResponse], error) {
	// TODO: Implement cluster information retrieval
	return connect.NewResponse(&v1.GetClusterResponse{
		Cluster: &v1.Cluster{},
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
