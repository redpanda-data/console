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
	"sort"

	"connectrpc.com/connect"
	"github.com/redpanda-data/common-go/api/pagination"
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

	// Add pagination
	var nextPageToken string
	if req.Msg.GetPageSize() > 0 {
		sort.SliceStable(quotaEntries, func(i, j int) bool {
			if quotaEntries[i].Entity.EntityType != quotaEntries[j].Entity.EntityType {
				return quotaEntries[i].Entity.EntityType < quotaEntries[j].Entity.EntityType
			}
			return quotaEntries[i].Entity.EntityName < quotaEntries[j].Entity.EntityName
		})
		page, token, err := pagination.SliceToPaginatedWithToken(quotaEntries, int(req.Msg.PageSize), req.Msg.GetPageToken(), "quotaEntry", func(x *v1.ListQuotasResponse_QuotaEntry) string {
			return fmt.Sprintf("%d_%s", x.Entity.EntityType, x.Entity.EntityName)
		})
		if err != nil {
			return nil, connect.NewError(
				connect.CodeInternal,
				fmt.Errorf("failed to apply pagination: %w", err),
			)
		}
		quotaEntries = page
		nextPageToken = token
	}

	response := &v1.ListQuotasResponse{
		Quotas:    quotaEntries,
		PageToken: nextPageToken,
	}

	return connect.NewResponse(response), nil
}

// BatchSetQuota creates client throughput quotas for specified entities.
func (s *Service) BatchSetQuota(ctx context.Context, req *connect.Request[v1.BatchSetQuotaRequest]) (*connect.Response[v1.BatchSetQuotaResponse], error) {
	kafkaReq, err := s.kafkaClientMapper.batchSetQuotaRequestToKafka(req.Msg)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	_, err = s.consoleSvc.AlterClientQuotas(ctx, kafkaReq)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to create quota: %w", err))
	}

	response := &v1.BatchSetQuotaResponse{}

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

// SetQuota creates or updates client throughput quotas for a single entity.
func (s *Service) SetQuota(ctx context.Context, req *connect.Request[v1.SetQuotaRequest]) (*connect.Response[v1.SetQuotaResponse], error) {
	kafkaReq, err := s.kafkaClientMapper.setQuotaRequestToKafka(req.Msg)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	_, err = s.consoleSvc.AlterClientQuotas(ctx, kafkaReq)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to set quota: %w", err))
	}

	response := &v1.SetQuotaResponse{}

	return connect.NewResponse(response), nil
}

// BatchDeleteQuota deletes client quotas for multiple entities and value types.
func (s *Service) BatchDeleteQuota(ctx context.Context, req *connect.Request[v1.BatchDeleteQuotaRequest]) (*connect.Response[v1.BatchDeleteQuotaResponse], error) {
	kafkaReq, err := s.kafkaClientMapper.batchDeleteQuotaRequestToKafka(req.Msg)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	_, err = s.consoleSvc.AlterClientQuotas(ctx, kafkaReq)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to batch delete quota: %w", err))
	}

	response := &v1.BatchDeleteQuotaResponse{}

	return connect.NewResponse(response), nil
}
