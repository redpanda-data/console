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
	"time"

	"connectrpc.com/connect"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/go-cache/cache"

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
	dispatcher        *dispatcher

	srACLSupportCache *cache.Cache[string, bool]
}

// NewService creates a new ACL service handler.
func NewService(cfg *config.Config,
	logger *slog.Logger,
	consoleSvc console.Servicer,
) *Service {
	cacheSettings := []cache.Opt{
		cache.MaxAge(15 * time.Minute),
		cache.MaxErrorAge(time.Second),
	}

	return &Service{
		cfg:               cfg,
		logger:            logger,
		consoleSvc:        consoleSvc,
		kafkaClientMapper: &kafkaClientMapper{},
		srClientMapper:    &schemaRegistryMapper{},
		defaulter:         &defaulter{},
		dispatcher:        &dispatcher{},
		srACLSupportCache: cache.New[string, bool](cacheSettings...),
	}
}

// ListACLs lists all stored ACLs from the target Kafka cluster.
func (s *Service) ListACLs(ctx context.Context, req *connect.Request[v1.ListACLsRequest]) (*connect.Response[v1.ListACLsResponse], error) {
	s.defaulter.applyListACLsRequest(req.Msg)

	target := s.dispatcher.analyzeTarget(req.Msg.GetFilter().GetResourceType())
	if err := s.dispatcher.validateCapabilities(target, s.checkSchemaRegistryACLSupport(ctx)); err != nil {
		return nil, err
	}

	var resources []*v1.ListACLsResponse_Resource
	if target.includesKafka() {
		kafkaResources, err := s.listKafkaACLs(ctx, req.Msg.GetFilter())
		if err != nil {
			return nil, err
		}
		resources = append(resources, kafkaResources...)
	}
	if target.includesSR() {
		srResources, err := s.listSchemaRegistryACLs(ctx, req.Msg.GetFilter())
		if err != nil {
			return nil, err
		}
		resources = append(resources, srResources...)
	}

	return connect.NewResponse(&v1.ListACLsResponse{Resources: resources}), nil
}

// CreateACL implements the handler for the create ACL endpoint.
func (s *Service) CreateACL(ctx context.Context, req *connect.Request[v1.CreateACLRequest]) (*connect.Response[v1.CreateACLResponse], error) {
	s.defaulter.applyCreateACLRequest(req.Msg)

	target := s.dispatcher.analyzeTarget(req.Msg.GetResourceType())
	if err := s.dispatcher.validateCapabilities(target, s.checkSchemaRegistryACLSupport(ctx)); err != nil {
		return nil, err
	}

	if target.includesKafka() {
		if err := s.createKafkaACLs(ctx, req.Msg); err != nil {
			return nil, err
		}
	}
	if target.includesSR() {
		if err := s.createSchemaRegistryACLs(ctx, req.Msg); err != nil {
			return nil, err
		}
	}

	connectResponse := connect.NewResponse(&v1.CreateACLResponse{})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusCreated))

	return connectResponse, nil
}

// DeleteACLs implements the handler for the delete ACL endpoint.
func (s *Service) DeleteACLs(ctx context.Context, req *connect.Request[v1.DeleteACLsRequest]) (*connect.Response[v1.DeleteACLsResponse], error) {
	target := s.dispatcher.analyzeTarget(req.Msg.GetFilter().GetResourceType())
	if err := s.dispatcher.validateCapabilities(target, s.checkSchemaRegistryACLSupport(ctx)); err != nil {
		return nil, err
	}

	var matchingACLsProto []*v1.DeleteACLsResponse_MatchingACL
	if target.includesKafka() {
		matchingKafkaACLs, err := s.deleteKafkaACLs(ctx, req.Msg)
		if err != nil {
			return nil, err
		}
		matchingACLsProto = append(matchingACLsProto, matchingKafkaACLs...)
	}

	if target.includesSR() {
		matchingSRACLs, err := s.deleteSchemaRegistryACLs(ctx, req.Msg)
		if err != nil {
			return nil, err
		}
		matchingACLsProto = append(matchingACLsProto, matchingSRACLs...)
	}

	return connect.NewResponse(&v1.DeleteACLsResponse{MatchingAcls: matchingACLsProto}), nil
}

// listKafkaACLs handles the Kafka ACL listing logic
func (s *Service) listKafkaACLs(ctx context.Context, filter *v1.ListACLsRequest_Filter) ([]*v1.ListACLsResponse_Resource, error) {
	kafkaReq, err := s.kafkaClientMapper.listACLFilterToDescribeACLKafka(filter)
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

	return resources, nil
}

// listSchemaRegistryACLs handles the Schema Registry ACL listing logic
func (s *Service) listSchemaRegistryACLs(ctx context.Context, filter *v1.ListACLsRequest_Filter) ([]*v1.ListACLsResponse_Resource, error) {
	// Filter can be nil if the filter contains no fields that are relevant for Schema Registry ACLs.
	srFilter := s.srClientMapper.listACLFilterToDescribeACLSR(filter)
	if srFilter == nil || !s.checkSchemaRegistryACLSupport(ctx) {
		return nil, nil
	}

	srACLres, err := s.consoleSvc.ListSRACLs(ctx, srFilter)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromSchemaRegistryError(err, "error listing Schema Registry ACLs: ")
	}

	srResources, err := s.srClientMapper.describeSRACLsResourceToProto(srACLres)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("error mapping Schema Registry ACLs response: %w", err),
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	return srResources, nil
}

func (s *Service) createKafkaACLs(ctx context.Context, req *v1.CreateACLRequest) error {
	kafkaReq, err := s.kafkaClientMapper.aclCreateRequestToKafka(req)
	if err != nil {
		return apierrors.NewConnectError(
			connect.CodeInternal, // Internal because all input should already be validated, and thus no err possible
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	res, err := s.consoleSvc.CreateACLs(ctx, kafkaReq)
	if err != nil {
		return apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(res.Results) != 1 {
		// Should never happen since we only create one ACL, but if it happens we want to err early.
		return apierrors.NewConnectError(
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
		return apierrors.NewConnectErrorFromKafkaErrorCode(result.ErrorCode, result.ErrorMessage)
	}
	return nil
}

func (s *Service) createSchemaRegistryACLs(ctx context.Context, req *v1.CreateACLRequest) error {
	srACLs := s.srClientMapper.aclCreateRequestToSR(req)

	err := s.consoleSvc.CreateSRACLs(ctx, srACLs)
	if err != nil {
		return apierrors.NewConnectErrorFromSchemaRegistryError(err, "error creating Schema Registry ACL: ")
	}
	return nil
}

func (s *Service) deleteKafkaACLs(ctx context.Context, req *v1.DeleteACLsRequest) ([]*v1.DeleteACLsResponse_MatchingACL, error) {
	kafkaReq, err := s.kafkaClientMapper.deleteACLFilterToDeleteACLKafka(req.GetFilter())
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
	return matchingACLsProto, nil
}

func (s *Service) deleteSchemaRegistryACLs(ctx context.Context, req *v1.DeleteACLsRequest) ([]*v1.DeleteACLsResponse_MatchingACL, error) {
	srFilter := s.srClientMapper.deleteACLFilterToSR(req.GetFilter())
	if srFilter == nil || !s.checkSchemaRegistryACLSupport(ctx) {
		return nil, nil
	}
	matchedSRACLs, err := s.consoleSvc.ListSRACLs(ctx, srFilter)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromSchemaRegistryError(err, "error listing Schema Registry ACLs: ")
	}
	if len(matchedSRACLs) == 0 {
		return nil, nil
	}
	if err := s.consoleSvc.DeleteSRACLs(ctx, matchedSRACLs); err != nil {
		return nil, apierrors.NewConnectErrorFromSchemaRegistryError(err, "error deleting Schema Registry ACLs: ")
	}
	matchingSRACLsProto, err := s.srClientMapper.deleteACLMatchingResultsToProtos(matchedSRACLs)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}
	return matchingSRACLsProto, nil
}

// checkSchemaRegistryACLSupport checks if Schema registry is enabled andSR ACLs
// are supported. It performs a cache lookup to avoid repeated calls.
func (s *Service) checkSchemaRegistryACLSupport(ctx context.Context) bool {
	supported, err, _ := s.srACLSupportCache.Get("sr-acl-support", func() (bool, error) {
		result := s.consoleSvc.CheckSchemaRegistryACLSupport(ctx)
		return result, nil
	})
	if err != nil {
		return false // fallback on error
	}
	return supported
}
