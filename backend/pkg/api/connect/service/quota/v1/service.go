// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package quota contains all handlers for the Quota endpoints.
package quota

import (
	"context"
	"fmt"
	"log/slog"

	"connectrpc.com/connect"
	"github.com/twmb/franz-go/pkg/kerr"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/console"
	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
)

var _ dataplanev1connect.QuotaServiceHandler = (*Service)(nil)

// Service implements the handlers for Quota endpoints.
type Service struct {
	cfg        *config.Config
	logger     *slog.Logger
	consoleSvc console.Servicer

	kafkaClientMapper *kafkaClientMapper
}

// NewService creates a new Quota service handler.
func NewService(cfg *config.Config,
	logger *slog.Logger,
	consoleSvc console.Servicer,
) *Service {
	return &Service{
		cfg:               cfg,
		logger:            logger,
		consoleSvc:        consoleSvc,
		kafkaClientMapper: &kafkaClientMapper{},
	}
}

// ListQuotas lists client quotas based on filter criteria.
func (s *Service) ListQuotas(ctx context.Context, req *connect.Request[v1.ListQuotasRequest]) (*connect.Response[v1.ListQuotasResponse], error) {
	kafkaReq, err := s.kafkaClientMapper.listQuotasRequestToKafka(req.Msg)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	resp, err := s.consoleSvc.DescribeClientQuotas(ctx, kafkaReq)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to describe quotas: %w", err))
	}

	// Handle errors from the console service
	if err = kerr.ErrorForCode(resp.ErrorCode); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to describe quotas: %s", err))
	}

	// Map console response to protobuf response
	quotaEntries, err := s.kafkaClientMapper.quotaItemsToProto(resp.Entries)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to map quota items to proto: %w", err))
	}

	response := &v1.ListQuotasResponse{
		Quotas: quotaEntries,
	}

	return connect.NewResponse(response), nil
}

// CreateQuota creates client throughput quotas for specified entities.
func (s *Service) CreateQuota(ctx context.Context, req *connect.Request[v1.CreateQuotaRequest]) (*connect.Response[v1.CreateQuotaResponse], error) {
	kafkaReq, err := s.kafkaClientMapper.createQuotaRequestToKafka(req.Msg)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	_, err = s.consoleSvc.AlterClientQuotas(ctx, kafkaReq)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to create quota: %w", err))
	}

	response := &v1.CreateQuotaResponse{}

	return connect.NewResponse(response), nil
}

// DeleteQuota deletes client quotas for specified entities and value types.
func (s *Service) DeleteQuota(ctx context.Context, req *connect.Request[v1.DeleteQuotaRequest]) (*connect.Response[v1.DeleteQuotaResponse], error) {
	kafkaReq, err := s.kafkaClientMapper.deleteQuotaRequestToKafka(req.Msg)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	_, err = s.consoleSvc.AlterClientQuotas(ctx, kafkaReq)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to delete quota: %w", err))
	}

	response := &v1.DeleteQuotaResponse{}

	return connect.NewResponse(response), nil
}
