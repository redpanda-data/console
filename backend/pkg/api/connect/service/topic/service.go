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
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"connectrpc.com/connect"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/console"
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

// ListTopics lists all Kafka topics with their most important metadata.
func (s *Service) ListTopics(ctx context.Context, req *connect.Request[v1alpha1.ListTopicsRequest]) (*connect.Response[v1alpha1.ListTopicsResponse], error) {
	kafkaReq := kmsg.NewMetadataRequest()
	kafkaRes, err := s.consoleSvc.GetMetadata(ctx, &kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	// Filter topics if a filter is set
	if req.Msg.Filter != nil && req.Msg.Filter.NameContains != "" {
		filteredTopics := make([]kmsg.MetadataResponseTopic, 0, len(kafkaRes.Topics))
		for _, topic := range kafkaRes.Topics {
			if strings.Contains(*topic.Topic, req.Msg.Filter.NameContains) {
				filteredTopics = append(filteredTopics, topic)
			}
		}
		kafkaRes.Topics = filteredTopics
	}

	protoResponse := s.mapper.kafkaMetadataToProto(kafkaRes)

	return connect.NewResponse(protoResponse), nil
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
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	return connect.NewResponse(&v1alpha1.GetTopicConfigurationsResponse{Configurations: configs}), nil
}

// UpdateTopicConfigurations patches a topic's configuration. In contrast to SetTopicConfiguration
// this will only change the configurations that have been passed into this request.
func (s *Service) UpdateTopicConfigurations(ctx context.Context, req *connect.Request[v1alpha1.UpdateTopicConfigurationsRequest]) (*connect.Response[v1alpha1.UpdateTopicConfigurationsResponse], error) {
	// 1. Map proto request to a Kafka request that can be processed by the Kafka client.
	kafkaReq, err := s.mapper.updateTopicConfigsToKafka(req.Msg)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because all input should already be validated, and thus no err possible
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	// 2. Send incremental alter request and handle errors
	kafkaRes, err := s.consoleSvc.IncrementalAlterConfigsKafka(ctx, kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(kafkaRes.Resources) != 1 {
		// Should never happen since we only edit configs for one topic, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("unexpected number of resources in incremental alter configs response"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
				Key:   "retrieved_results",
				Value: strconv.Itoa(len(kafkaRes.Resources)),
			}),
		)
	}

	// Check for inner Kafka error
	result := kafkaRes.Resources[0]
	if connectErr := s.handleKafkaTopicError(result.ErrorCode, result.ErrorMessage); connectErr != nil {
		return nil, connectErr
	}

	// 3. Now let's describe the topic config and return the entire topic configuration.
	// This is very similar to GetTopicConfigurations, but we handle errors differently
	describeKafkaReq := s.mapper.describeTopicConfigsToKafka(&v1alpha1.GetTopicConfigurationsRequest{TopicName: req.Msg.TopicName})
	configsRes, err := s.consoleSvc.DescribeConfigs(ctx, &describeKafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("failed to describe topic configs after successfully applying config change: %w", err),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(configsRes.Resources) != 1 {
		// Should never happen since we only describe one topic, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("failed to describe topic configs after successfully applying config change: unexpected number of resources in describe configs response"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
				Key:   "retrieved_resources",
				Value: strconv.Itoa(len(configsRes.Resources)),
			}),
		)
	}

	// Check for inner Kafka error
	describeConfigsResult := configsRes.Resources[0]
	if connectErr := s.handleKafkaTopicError(describeConfigsResult.ErrorCode, describeConfigsResult.ErrorMessage); connectErr != nil {
		return nil, connectErr
	}

	// 4. Convert describe topic config response into the proto response
	protoTopicConfigs, err := s.mapper.describeTopicConfigsToProto(describeConfigsResult.Configs)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	return connect.NewResponse(&v1alpha1.UpdateTopicConfigurationsResponse{Configurations: protoTopicConfigs}), nil
}

// SetTopicConfigurations applies the given configuration to a topic, which may reset
// or overwrite existing configurations that are not provided as part of the request.
// If you want to patch certain configurations use UpdateTopicConfiguration instead.
func (s *Service) SetTopicConfigurations(ctx context.Context, req *connect.Request[v1alpha1.SetTopicConfigurationsRequest]) (*connect.Response[v1alpha1.SetTopicConfigurationsResponse], error) {
	// 1. Map proto request to a Kafka request that can be processed by the Kafka client.
	kafkaReq := s.mapper.setTopicConfigurationsToKafka(req.Msg)

	// 2. Send incremental alter request and handle errors
	alterConfigsRes, err := s.consoleSvc.AlterConfigs(ctx, kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(alterConfigsRes.Resources) != 1 {
		// Should never happen since we only edit configs for one topic, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("unexpected number of resources in alter configs response"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
				Key:   "retrieved_results",
				Value: strconv.Itoa(len(alterConfigsRes.Resources)),
			}),
		)
	}

	// Check for inner Kafka error
	result := alterConfigsRes.Resources[0]
	if connectErr := s.handleKafkaTopicError(result.ErrorCode, result.ErrorMessage); connectErr != nil {
		return nil, connectErr
	}

	// 3. Now let's describe the topic config and return the entire topic configuration.
	// This is very similar to GetTopicConfigurations, but we handle errors differently
	describeKafkaReq := s.mapper.describeTopicConfigsToKafka(&v1alpha1.GetTopicConfigurationsRequest{TopicName: req.Msg.TopicName})
	configsRes, err := s.consoleSvc.DescribeConfigs(ctx, &describeKafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("failed to describe topic configs after successfully applying config change: %w", err),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(configsRes.Resources) != 1 {
		// Should never happen since we only describe one topic, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("failed to describe topic configs after successfully applying config change: unexpected number of resources in describe configs response"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
				Key:   "retrieved_resources",
				Value: strconv.Itoa(len(configsRes.Resources)),
			}),
		)
	}

	// Check for inner Kafka error
	describeConfigsResult := configsRes.Resources[0]
	if connectErr := s.handleKafkaTopicError(describeConfigsResult.ErrorCode, describeConfigsResult.ErrorMessage); connectErr != nil {
		return nil, connectErr
	}

	// 4. Convert describe topic config response into the proto response
	protoTopicConfigs, err := s.mapper.describeTopicConfigsToProto(describeConfigsResult.Configs)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	return connect.NewResponse(&v1alpha1.SetTopicConfigurationsResponse{Configurations: protoTopicConfigs}), nil
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
		Name:              response.Name,
		PartitionCount:    response.PartitionCount,
		ReplicationFactor: response.ReplicationFactor,
	})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusCreated))
	return connectResponse, nil
}
