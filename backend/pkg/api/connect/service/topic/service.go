// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package topic contains all handlers for the topic endpoints.
package topic

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/console"
	commonv1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/common/v1alpha1"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
)

var _ dataplanev1alpha1connect.TopicServiceHandler = (*Service)(nil)

// Service that implements the UserServiceHandler interface. This includes all
// RPCs to manage Redpanda or Kafka users.
type Service struct {
	cfg        *config.Config
	logger     *zap.Logger
	consoleSvc console.Servicer
	mapper     kafkaClientMapper
}

// ListTopics lists all Kafka topics.
func (*Service) ListTopics(context.Context, *connect.Request[v1alpha1.ListTopicsRequest]) (*connect.Response[v1alpha1.ListTopicsResponse], error) {
	return nil, apierrors.NewConnectError(
		connect.CodeUnimplemented,
		errors.New("this endpoint is not yet implemented"),
		apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
	)
}

// DeleteTopic deletes a Kafka topic.
func (s *Service) DeleteTopic(ctx context.Context, req *connect.Request[v1alpha1.DeleteTopicRequest]) (*connect.Response[v1alpha1.DeleteTopicResponse], error) {
	kafkaReq := s.mapper.deleteTopicToKmsg(req.Msg)
	kafkaRes, err := s.consoleSvc.DeleteTopics(ctx, &kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(kafkaRes.Topics) != 1 {
		// Should never happen since we only delete one topic, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("unexpected number of results in create topics response"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
				Key:   "retrieved_results",
				Value: strconv.Itoa(len(kafkaRes.Topics)),
			}),
		)
	}

	result := kafkaRes.Topics[0]
	if connectErr := s.handleKafkaTopicError(result.ErrorCode, result.ErrorMessage); connectErr != nil {
		return nil, connectErr
	}

	connectResponse := connect.NewResponse(&v1alpha1.DeleteTopicResponse{})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusNoContent))

	return connectResponse, nil
}

// GetTopicConfigurations retrieves a topic's configuration.
func (s *Service) GetTopicConfigurations(ctx context.Context, req *connect.Request[v1alpha1.GetTopicConfigurationsRequest]) (*connect.Response[v1alpha1.GetTopicConfigurationsResponse], error) {
	kafkaReq := s.mapper.describeTopicConfigsToKafka(req.Msg)
	configsRes, err := s.consoleSvc.DescribeConfigs(ctx, &kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(configsRes.Resources) != 1 {
		// Should never happen since we only describe one topic, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("unexpected number of resources in describe configs response"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
				Key:   "retrieved_resources",
				Value: strconv.Itoa(len(configsRes.Resources)),
			}),
		)
	}

	// Check for inner Kafka error
	result := configsRes.Resources[0]
	if connectErr := s.handleKafkaTopicError(result.ErrorCode, result.ErrorMessage); connectErr != nil {
		return nil, connectErr
	}

	configs, err := s.mapper.describeTopicConfigsToProto(result.Configs)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because all input should already be validated, and thus no err possible
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	return connect.NewResponse(&v1alpha1.GetTopicConfigurationsResponse{Configurations: configs}), nil
}

// UpdateTopicConfiguration patches a topic's configuration. In contrast to SetTopicConfiguration
// this will only change the configurations that have been passed into this request.
func (*Service) UpdateTopicConfiguration(context.Context, *connect.Request[v1alpha1.UpdateTopicConfigurationRequest]) (*connect.Response[v1alpha1.UpdateTopicConfigurationResponse], error) {
	return nil, apierrors.NewConnectError(
		connect.CodeUnimplemented,
		errors.New("this endpoint is not yet implemented"),
		apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
	)
}

// SetTopicConfiguration applies the given configuration to a topic, which may reset
// or overwrite existing configurations that are not provided as part of the request.
// If you want to patch certain configurations use UpdateTopicConfiguration instead.
func (*Service) SetTopicConfiguration(context.Context, *connect.Request[v1alpha1.SetTopicConfigurationRequest]) (*connect.Response[v1alpha1.SetTopicConfigurationResponse], error) {
	return nil, apierrors.NewConnectError(
		connect.CodeUnimplemented,
		errors.New("this endpoint is not yet implemented"),
		apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
	)
}

// NewService creates a new user service handler.
func NewService(cfg *config.Config,
	logger *zap.Logger,
	consoleSvc console.Servicer,
) *Service {
	return &Service{
		cfg:        cfg,
		logger:     logger,
		consoleSvc: consoleSvc,
		mapper:     kafkaClientMapper{},
	}
}

// CreateTopic creates a new Kafka topic.
func (s *Service) CreateTopic(ctx context.Context, req *connect.Request[v1alpha1.CreateTopicRequest]) (*connect.Response[v1alpha1.CreateTopicResponse], error) {
	kafkaReq := s.mapper.createTopicRequestToKafka(req.Msg)

	kafkaRes, err := s.consoleSvc.CreateTopics(ctx, kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(kafkaRes.Topics) != 1 {
		// Should never happen since we only create one topic, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("unexpected number of results in create topics response"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
				Key:   "retrieved_results",
				Value: strconv.Itoa(len(kafkaRes.Topics)),
			}),
		)
	}

	// Check for inner Kafka error
	result := kafkaRes.Topics[0]
	if connectErr := s.handleKafkaTopicError(result.ErrorCode, result.ErrorMessage); connectErr != nil {
		return nil, connectErr
	}

	// Map Kafka response to proto
	response := s.mapper.createTopicResponseTopicToProto(result)

	connectResponse := connect.NewResponse(&v1alpha1.CreateTopicResponse{
		Name: response.Name,
	})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusCreated))
	return connectResponse, nil
}
