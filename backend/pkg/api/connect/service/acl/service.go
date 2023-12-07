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
	"net/http"
	"strconv"

	"connectrpc.com/connect"
	"github.com/twmb/franz-go/pkg/kerr"
	"go.uber.org/zap"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/console"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
)

var _ dataplanev1alpha1connect.ACLServiceHandler = (*Service)(nil)

// Service implements the handlers for ACL endpoints.
type Service struct {
	cfg        *config.Config
	logger     *zap.Logger
	consoleSvc console.Servicer

	kafkaClientMapper *kafkaClientMapper
	defaulter         *defaulter
}

// NewService creates a new ACL service handler.
func NewService(cfg *config.Config,
	logger *zap.Logger,
	consoleSvc console.Servicer,
) *Service {
	return &Service{
		cfg:               cfg,
		logger:            logger,
		consoleSvc:        consoleSvc,
		kafkaClientMapper: &kafkaClientMapper{},
		defaulter:         &defaulter{},
	}
}

// ListACLs lists all stored ACLs from the target Kafka cluster.
func (s *Service) ListACLs(ctx context.Context, req *connect.Request[v1alpha1.ListACLsRequest]) (*connect.Response[v1alpha1.ListACLsResponse], error) {
	s.defaulter.applyListACLsRequest(req.Msg)

	kafkaReq, err := s.kafkaClientMapper.aclFilterToDescribeACLKafka(req.Msg.Filter)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because all input should already be validated, and thus no err possible
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	aclOverview, err := s.consoleSvc.ListAllACLs(ctx, *kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
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
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	// Handle Kafka error that may be set as part of the Kafka response
	kafkaRes := aclOverview.KafkaResponse
	if kafkaRes.ErrorCode != 0 {
		return nil, apierrors.NewConnectErrorFromKafkaErrorCode(kafkaRes.ErrorCode, kafkaRes.ErrorMessage)
	}

	resources := make([]*v1alpha1.ListACLsResponse_Resource, len(kafkaRes.Resources))
	for i, aclRes := range kafkaRes.Resources {
		aclResProto, err := s.kafkaClientMapper.describeACLsResourceToProto(aclRes)
		if err != nil {
			return nil, apierrors.NewConnectError(
				connect.CodeInternal,
				err,
				apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String()),
			)
		}
		resources[i] = aclResProto
	}

	return connect.NewResponse(&v1alpha1.ListACLsResponse{Resources: resources}), nil
}

// CreateACL implements the handler for the create ACL endpoint.
func (s *Service) CreateACL(ctx context.Context, req *connect.Request[v1alpha1.CreateACLRequest]) (*connect.Response[v1alpha1.CreateACLResponse], error) {
	s.defaulter.applyCreateACLRequest(req.Msg)

	kafkaReq, err := s.kafkaClientMapper.aclCreateRequestToKafka(req.Msg)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because all input should already be validated, and thus no err possible
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	res, err := s.consoleSvc.CreateACLs(ctx, kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(res.Results) != 1 {
		// Should never happen since we only create one ACL, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("unexpected number of results in create ACL response"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
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

	connectResponse := connect.NewResponse(&v1alpha1.CreateACLResponse{})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusCreated))

	return connectResponse, nil
}

// DeleteACLs implements the handler for the delete ACL endpoint.
func (s *Service) DeleteACLs(ctx context.Context, req *connect.Request[v1alpha1.DeleteACLsRequest]) (*connect.Response[v1alpha1.DeleteACLsResponse], error) {
	// TODO: Ensure that neither req, req.Msg or req.Msg.Filter can never be nil
	kafkaReq, err := s.kafkaClientMapper.aclFilterToDeleteACLKafka(req.Msg.Filter)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because all input should already be validated, and thus no err possible
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	res, err := s.consoleSvc.DeleteACLsKafka(ctx, kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	// TODO: Check how we want to handle multiple errors / partial success in the response
	return nil, nil
}
