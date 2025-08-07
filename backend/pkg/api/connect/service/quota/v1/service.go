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

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
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
	kafkaReq := s.kafkaClientMapper.listQuotasRequestToKafka(req.Msg)

	resp, err := s.consoleSvc.DescribeClientQuotas(ctx, kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	// Handle errors from the console service
	if err = kerr.ErrorForCode(resp.ErrorCode); err != nil {
		return nil, apierrors.NewConnectErrorFromKafkaErrorCode(resp.ErrorCode, resp.ErrorMessage)
	}

	// Map console response to protobuf response
	quotaEntries, err := s.kafkaClientMapper.quotaItemsToProto(resp.Entries)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
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
			return nil, apierrors.NewConnectError(
				connect.CodeInternal,
				fmt.Errorf("failed to apply pagination: %w", err),
				apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
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
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	resp, err := s.consoleSvc.AlterClientQuotas(ctx, kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	successfulEntities, failedEntities := s.kafkaClientMapper.mapAlterClientQuotasResponse(resp.Entries)

	response := &v1.BatchSetQuotaResponse{
		SuccessfulEntities: successfulEntities,
		FailedEntities:     failedEntities,
	}

	return connect.NewResponse(response), nil
}

// DeleteQuota deletes client quotas for specified entities and value types.
func (s *Service) DeleteQuota(ctx context.Context, req *connect.Request[v1.DeleteQuotaRequest]) (*connect.Response[v1.DeleteQuotaResponse], error) {
	kafkaReq, err := s.kafkaClientMapper.deleteQuotaRequestToKafka(req.Msg)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	resp, err := s.consoleSvc.AlterClientQuotas(ctx, kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}
	// For single delete quota requests, we expect a single entry in the response
	// loop through the entries and return if any error occurs
	for _, entry := range resp.Entries {
		if err = kerr.ErrorForCode(entry.ErrorCode); err != nil {
			return nil, apierrors.NewConnectErrorFromKafkaErrorCode(entry.ErrorCode, entry.ErrorMessage)
		}
	}

	return connect.NewResponse(&v1.DeleteQuotaResponse{}), nil
}

// SetQuota creates or updates client throughput quotas for a single entity.
func (s *Service) SetQuota(ctx context.Context, req *connect.Request[v1.SetQuotaRequest]) (*connect.Response[v1.SetQuotaResponse], error) {
	kafkaReq, err := s.kafkaClientMapper.setQuotaRequestToKafka(req.Msg)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	resp, err := s.consoleSvc.AlterClientQuotas(ctx, kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}
	// For single set quota requests, we expect a single entry in the response
	// loop through the entries and return if any error occurs
	for _, entry := range resp.Entries {
		if err = kerr.ErrorForCode(entry.ErrorCode); err != nil {
			return nil, apierrors.NewConnectErrorFromKafkaErrorCode(entry.ErrorCode, entry.ErrorMessage)
		}
	}

	response := &v1.SetQuotaResponse{}

	return connect.NewResponse(response), nil
}

// BatchDeleteQuota deletes client quotas for multiple entities and value types.
func (s *Service) BatchDeleteQuota(ctx context.Context, req *connect.Request[v1.BatchDeleteQuotaRequest]) (*connect.Response[v1.BatchDeleteQuotaResponse], error) {
	kafkaReq, err := s.kafkaClientMapper.batchDeleteQuotaRequestToKafka(req.Msg)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	resp, err := s.consoleSvc.AlterClientQuotas(ctx, kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	successfulEntities, failedEntities := s.kafkaClientMapper.mapAlterClientQuotasResponse(resp.Entries)

	response := &v1.BatchDeleteQuotaResponse{
		SuccessfulEntities: successfulEntities,
		FailedEntities:     failedEntities,
	}

	return connect.NewResponse(response), nil
}
