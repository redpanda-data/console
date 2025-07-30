// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package acl contains all handlers for the ACL endpoints.
package acl

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"connectrpc.com/connect"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/sr"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/console"
	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
)

var _ dataplanev1connect.ACLServiceHandler = (*Service)(nil)

// Service implements the handlers for ACL endpoints.
type Service struct {
	cfg        *config.Config
	logger     *slog.Logger
	consoleSvc console.Servicer

	kafkaClientMapper *kafkaClientMapper
	srClientMapper    *schemaRegistryMapper
	defaulter         *defaulter
}

// NewService creates a new ACL service handler.
func NewService(cfg *config.Config,
	logger *slog.Logger,
	consoleSvc console.Servicer,
) *Service {
	return &Service{
		cfg:               cfg,
		logger:            logger,
		consoleSvc:        consoleSvc,
		kafkaClientMapper: &kafkaClientMapper{},
		srClientMapper:    &schemaRegistryMapper{},
		defaulter:         &defaulter{},
	}
}

// ListACLs lists all stored ACLs from the target Kafka cluster.
func (s *Service) ListACLs(ctx context.Context, req *connect.Request[v1.ListACLsRequest]) (*connect.Response[v1.ListACLsResponse], error) {
	s.defaulter.applyListACLsRequest(req.Msg)

	kafkaReq, err := s.kafkaClientMapper.listACLFilterToDescribeACLKafka(req.Msg.Filter)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because all input should already be validated, and thus no err possible
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	aclOverview, err := s.consoleSvc.ListAllACLs(ctx, *kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	// We want to return an error in case the authorizer is disabled. We must ensure that this
	// error can be handled by the consumers. This is the only Kafka error that is already
	// caught by the Console service, we kind of revert this catch handler here.
	if !aclOverview.IsAuthorizerEnabled {
		err = kerr.SecurityDisabled
		return nil, apierrors.NewConnectError(
			connect.CodeUnimplemented,
			errors.New("no authorizer enabled for the Kafka API"),
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	// Handle Kafka error that may be set as part of the Kafka response
	kafkaRes := aclOverview.KafkaResponse
	if kafkaRes.ErrorCode != 0 {
		return nil, apierrors.NewConnectErrorFromKafkaErrorCode(kafkaRes.ErrorCode, kafkaRes.ErrorMessage)
	}

	resources := make([]*v1.ListACLsResponse_Resource, len(kafkaRes.Resources))
	for i, aclRes := range kafkaRes.Resources {
		aclResProto, err := s.kafkaClientMapper.describeACLsResourceToProto(aclRes)
		if err != nil {
			return nil, apierrors.NewConnectError(
				connect.CodeInternal,
				err,
				apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
			)
		}
		resources[i] = aclResProto
	}

	// Filter can be nil if the filter contains no fields that are relevant
	// for Schema Registry ACLs.
	srFilter := s.srClientMapper.listACLFilterToDescribeACLSR(req.Msg.Filter)
	checkSchemaRegistryACLs := srFilter != nil && s.cfg.SchemaRegistry.Enabled
	if !checkSchemaRegistryACLs {
		return connect.NewResponse(&v1.ListACLsResponse{Resources: resources}), nil
	}

	srACLres, err := s.consoleSvc.ListSRACLs(ctx, srFilter)
	if err != nil {
		// Handle the case where an older cluster returns "Not found" for Schema Registry ACLs
		// This means the cluster doesn't support Schema Registry ACLs, so we gracefully continue
		// without returning an error and just return the Kafka ACLs.
		if se := (*sr.ResponseError)(nil); errors.As(err, &se) && se.StatusCode == http.StatusNotFound {
			return connect.NewResponse(&v1.ListACLsResponse{Resources: resources}), nil
		}

		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("error listing Schema Registry ACLs: %w", err),
			apierrors.NewErrorInfo(v1.Reason_REASON_REDPANDA_SCHEMA_REGISTRY_ERROR.String()),
		)
	}
	srResources, err := s.srClientMapper.describeSRACLsResourceToProto(srACLres)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("error mapping Schema Registry ACLs response: %w", err),
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}
	// We can safely append the Schema Registry resources to the Kafka
	// resources as they will always have different resource types.
	resources = append(resources, srResources...)

	return connect.NewResponse(&v1.ListACLsResponse{Resources: resources}), nil
}

// CreateACL implements the handler for the create ACL endpoint.
func (s *Service) CreateACL(ctx context.Context, req *connect.Request[v1.CreateACLRequest]) (*connect.Response[v1.CreateACLResponse], error) {
	s.defaulter.applyCreateACLRequest(req.Msg)

	kafkaReq, err := s.kafkaClientMapper.aclCreateRequestToKafka(req.Msg)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because all input should already be validated, and thus no err possible
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	res, err := s.consoleSvc.CreateACLs(ctx, kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(res.Results) != 1 {
		// Should never happen since we only create one ACL, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("unexpected number of results in create ACL response"),
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
				Key:   "retrieved_results",
				Value: strconv.Itoa(len(res.Results)),
			}),
		)
	}

	// Check for inner Kafka error
	result := res.Results[0]
	if result.ErrorCode != 0 {
		return nil, apierrors.NewConnectErrorFromKafkaErrorCode(result.ErrorCode, result.ErrorMessage)
	}

	connectResponse := connect.NewResponse(&v1.CreateACLResponse{})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusCreated))

	return connectResponse, nil
}

// DeleteACLs implements the handler for the delete ACL endpoint.
func (s *Service) DeleteACLs(ctx context.Context, req *connect.Request[v1.DeleteACLsRequest]) (*connect.Response[v1.DeleteACLsResponse], error) {
	// TODO: Ensure that neither req, req.Msg or req.Msg.Filter can never be nil
	kafkaReq, err := s.kafkaClientMapper.deleteACLFilterToDeleteACLKafka(req.Msg.Filter)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because all input should already be validated, and thus no err possible
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	res, err := s.consoleSvc.DeleteACLsKafka(ctx, kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(res.Results) != 1 {
		// Should never happen since we only delete one ACL, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("unexpected number of results in delete ACL response"),
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
				Key:   "retrieved_results",
				Value: strconv.Itoa(len(res.Results)),
			}),
		)
	}

	// Check for inner Kafka error
	result := res.Results[0]
	if result.ErrorCode != 0 {
		return nil, apierrors.NewConnectErrorFromKafkaErrorCode(result.ErrorCode, result.ErrorMessage)
	}

	matchingACLsProto, err := s.kafkaClientMapper.deleteACLMatchingResultsToProtos(result.MatchingACLs)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	return connect.NewResponse(&v1.DeleteACLsResponse{MatchingAcls: matchingACLsProto}), nil
}
