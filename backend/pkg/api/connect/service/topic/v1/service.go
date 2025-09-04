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
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"

	"connectrpc.com/connect"
	"github.com/redpanda-data/common-go/api/pagination"
	"github.com/twmb/franz-go/pkg/kmsg"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/console"
	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
)

var _ dataplanev1connect.TopicServiceHandler = (*Service)(nil)

// Service that implements the UserServiceHandler interface. This includes all
// RPCs to manage Redpanda or Kafka users.
type Service struct {
	cfg        *config.Config
	logger     *slog.Logger
	consoleSvc console.Servicer
	mapper     mapper
	defaulter  defaulter
}

// ListTopics lists all Kafka topics with their most important metadata.
func (s *Service) ListTopics(ctx context.Context, req *connect.Request[v1.ListTopicsRequest]) (*connect.Response[v1.ListTopicsResponse], error) {
	s.defaulter.applyListTopicsRequest(req.Msg)
	kafkaReq := kmsg.NewMetadataRequest()
	kafkaRes, err := s.consoleSvc.GetMetadata(ctx, &kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
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

	topicsResponse := s.mapper.kafkaMetadataToProto(kafkaRes)

	// Apply pagination first to reduce the topics we need to enhance
	var nextPageToken string
	if req.Msg.GetPageSize() > 0 {
		sort.SliceStable(topicsResponse, func(i, j int) bool {
			return topicsResponse[i].Name < topicsResponse[j].Name
		})
		page, token, err := pagination.SliceToPaginatedWithToken(topicsResponse, int(req.Msg.PageSize), req.Msg.GetPageToken(), "name", func(x *v1.ListTopicsResponse_Topic) string {
			return x.GetName()
		})
		if err != nil {
			return nil, apierrors.NewConnectError(
				connect.CodeInternal,
				fmt.Errorf("failed to apply pagination: %w", err),
				apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
			)
		}
		topicsResponse = page
		nextPageToken = token
	}

	s.enhanceTopicsWithAdditionalData(ctx, topicsResponse, kafkaRes)

	return connect.NewResponse(&v1.ListTopicsResponse{Topics: topicsResponse, NextPageToken: nextPageToken}), nil
}

// enhanceTopicsWithAdditionalData adds cleanup policy, documentation, and log dir summary to topics
func (s *Service) enhanceTopicsWithAdditionalData(ctx context.Context, topicsRes []*v1.ListTopicsResponse_Topic, metadata *kmsg.MetadataResponse) {
	if len(topicsRes) == 0 {
		return
	}

	// Enhance with additional information concurrently
	var wg sync.WaitGroup
	wg.Add(3)

	go func() {
		defer wg.Done()
		s.enhanceTopicsWithCleanupPolicy(ctx, topicsRes)
	}()

	go func() {
		defer wg.Done()
		s.enhanceTopicsWithLogDirs(ctx, topicsRes, metadata)
	}()

	go func() {
		defer wg.Done()
		s.enhanceTopicsWithDocumentation(topicsRes)
	}()

	wg.Wait()
}

// enhanceTopicsWithCleanupPolicy fetches topic configurations (like cleanup.policy) using raw Kafka API
func (s *Service) enhanceTopicsWithCleanupPolicy(ctx context.Context, topics []*v1.ListTopicsResponse_Topic) {
	// Build describe configs request for all topics
	configReq := kmsg.NewDescribeConfigsRequest()
	configReq.IncludeDocumentation = false
	configReq.IncludeSynonyms = false

	// Create topic name to index map for efficient lookups
	topicIndexMap := make(map[string]int, len(topics))
	for i, topic := range topics {
		topicIndexMap[topic.Name] = i

		resource := kmsg.NewDescribeConfigsRequestResource()
		resource.ResourceType = kmsg.ConfigResourceTypeTopic
		resource.ResourceName = topic.Name
		resource.ConfigNames = []string{"cleanup.policy"}
		configReq.Resources = append(configReq.Resources, resource)
	}

	// Make the request
	configResp, err := s.consoleSvc.DescribeConfigs(ctx, &configReq)
	if err != nil {
		s.logger.Warn("failed to describe topic configs", "error", err)
		return
	}

	// Apply configs directly to topics by index
	for _, resource := range configResp.Resources {
		topicIndex, exists := topicIndexMap[resource.ResourceName]
		if !exists {
			continue
		}

		for _, cfg := range resource.Configs {
			if cfg.Name == "cleanup.policy" && cfg.Value != nil {
				topics[topicIndex].CleanupPolicy = cfg.Value
				break
			}
		}
	}
}

// enhanceTopicsWithLogDirs fetches log directory sizes using raw Kafka API
func (s *Service) enhanceTopicsWithLogDirs(ctx context.Context, topics []*v1.ListTopicsResponse_Topic, metadata *kmsg.MetadataResponse) {
	// Build describe log dirs request for all topic partitions
	logDirReq := kmsg.NewDescribeLogDirsRequest()

	// Create map of topics for quick lookup
	topicsByName := make(map[string]*v1.ListTopicsResponse_Topic)
	for _, topic := range topics {
		topicsByName[topic.Name] = topic
	}

	for _, topicMetadata := range metadata.Topics {
		topicName := *topicMetadata.Topic
		if _, exists := topicsByName[topicName]; !exists {
			continue
		}

		// Add all partitions for this topic
		requestTopic := kmsg.NewDescribeLogDirsRequestTopic()
		requestTopic.Topic = topicName

		for _, partition := range topicMetadata.Partitions {
			requestTopic.Partitions = append(requestTopic.Partitions, partition.Partition)
		}

		logDirReq.Topics = append(logDirReq.Topics, requestTopic)
	}

	// Make the request
	logDirResp, err := s.consoleSvc.DescribeLogDirs(ctx, &logDirReq)
	if err != nil {
		return // Silently fail, enhanced info is optional
	}

	// Calculate total size per topic
	topicSizes := make(map[string]int64)
	for _, logDir := range logDirResp.Dirs {
		for _, topicLogDir := range logDir.Topics {
			for _, partition := range topicLogDir.Partitions {
				topicSizes[topicLogDir.Topic] += partition.Size
			}
		}
	}

	// Apply log dir summaries to topics
	for _, topic := range topics {
		if totalSize, exists := topicSizes[topic.Name]; exists && totalSize > 0 {
			topic.LogDirSummary = &v1.ListTopicsResponse_Topic_LogDirSummary{
				TotalSizeBytes: totalSize,
			}
		}
	}
}

// enhanceTopicsWithDocumentation fetches topic documentation state
func (s *Service) enhanceTopicsWithDocumentation(topics []*v1.ListTopicsResponse_Topic) {
	for _, topic := range topics {
		docs := s.consoleSvc.GetTopicDocumentation(topic.Name)
		var docState v1.DocumentationState
		switch {
		case !docs.IsEnabled:
			docState = v1.DocumentationState_DOCUMENTATION_STATE_NOT_CONFIGURED
		case docs.Markdown == nil:
			docState = v1.DocumentationState_DOCUMENTATION_STATE_NOT_EXISTENT
		default:
			docState = v1.DocumentationState_DOCUMENTATION_STATE_AVAILABLE
		}
		topic.Documentation = &docState
	}
}

// DeleteTopic deletes a Kafka topic.
func (s *Service) DeleteTopic(ctx context.Context, req *connect.Request[v1.DeleteTopicRequest]) (*connect.Response[v1.DeleteTopicResponse], error) {
	kafkaReq := s.mapper.deleteTopicToKmsg(req.Msg)
	kafkaRes, err := s.consoleSvc.DeleteTopics(ctx, &kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(kafkaRes.Topics) != 1 {
		// Should never happen since we only delete one topic, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("unexpected number of results in create topics response"),
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
				Key:   "retrieved_results",
				Value: strconv.Itoa(len(kafkaRes.Topics)),
			}),
		)
	}

	result := kafkaRes.Topics[0]
	if connectErr := s.handleKafkaTopicError(result.ErrorCode, result.ErrorMessage); connectErr != nil {
		return nil, connectErr
	}

	connectResponse := connect.NewResponse(&v1.DeleteTopicResponse{})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusNoContent))

	return connectResponse, nil
}

// GetTopicConfigurations retrieves a topic's configuration.
func (s *Service) GetTopicConfigurations(ctx context.Context, req *connect.Request[v1.GetTopicConfigurationsRequest]) (*connect.Response[v1.GetTopicConfigurationsResponse], error) {
	kafkaReq := s.mapper.describeTopicConfigsToKafka(req.Msg)
	configsRes, err := s.consoleSvc.DescribeConfigs(ctx, &kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(configsRes.Resources) != 1 {
		// Should never happen since we only describe one topic, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("unexpected number of resources in describe configs response"),
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
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
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	return connect.NewResponse(&v1.GetTopicConfigurationsResponse{Configurations: configs}), nil
}

// UpdateTopicConfigurations patches a topic's configuration. In contrast to SetTopicConfiguration
// this will only change the configurations that have been passed into this request.
func (s *Service) UpdateTopicConfigurations(ctx context.Context, req *connect.Request[v1.UpdateTopicConfigurationsRequest]) (*connect.Response[v1.UpdateTopicConfigurationsResponse], error) {
	// 1. Map proto request to a Kafka request that can be processed by the Kafka client.
	kafkaReq, err := s.mapper.updateTopicConfigsToKafka(req.Msg)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because all input should already be validated, and thus no err possible
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	// 2. Send incremental alter request and handle errors
	kafkaRes, err := s.consoleSvc.IncrementalAlterConfigsKafka(ctx, kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(kafkaRes.Resources) != 1 {
		// Should never happen since we only edit configs for one topic, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("unexpected number of resources in incremental alter configs response"),
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
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
	describeKafkaReq := s.mapper.describeTopicConfigsToKafka(&v1.GetTopicConfigurationsRequest{TopicName: req.Msg.TopicName})
	configsRes, err := s.consoleSvc.DescribeConfigs(ctx, &describeKafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("failed to describe topic configs after successfully applying config change: %w", err),
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(configsRes.Resources) != 1 {
		// Should never happen since we only describe one topic, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("failed to describe topic configs after successfully applying config change: unexpected number of resources in describe configs response"),
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
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
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	return connect.NewResponse(&v1.UpdateTopicConfigurationsResponse{Configurations: protoTopicConfigs}), nil
}

// SetTopicConfigurations applies the given configuration to a topic, which may reset
// or overwrite existing configurations that are not provided as part of the request.
// If you want to patch certain configurations use UpdateTopicConfiguration instead.
func (s *Service) SetTopicConfigurations(ctx context.Context, req *connect.Request[v1.SetTopicConfigurationsRequest]) (*connect.Response[v1.SetTopicConfigurationsResponse], error) {
	// 1. Map proto request to a Kafka request that can be processed by the Kafka client.
	kafkaReq := s.mapper.setTopicConfigurationsToKafka(req.Msg)

	// 2. Send incremental alter request and handle errors
	alterConfigsRes, err := s.consoleSvc.AlterConfigs(ctx, kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(alterConfigsRes.Resources) != 1 {
		// Should never happen since we only edit configs for one topic, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("unexpected number of resources in alter configs response"),
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
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
	describeKafkaReq := s.mapper.describeTopicConfigsToKafka(&v1.GetTopicConfigurationsRequest{TopicName: req.Msg.TopicName})
	configsRes, err := s.consoleSvc.DescribeConfigs(ctx, &describeKafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("failed to describe topic configs after successfully applying config change: %w", err),
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(configsRes.Resources) != 1 {
		// Should never happen since we only describe one topic, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("failed to describe topic configs after successfully applying config change: unexpected number of resources in describe configs response"),
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
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
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	return connect.NewResponse(&v1.SetTopicConfigurationsResponse{Configurations: protoTopicConfigs}), nil
}

// NewService creates a new user service handler.
func NewService(cfg *config.Config,
	logger *slog.Logger,
	consoleSvc console.Servicer,
) *Service {
	return &Service{
		cfg:        cfg,
		logger:     logger,
		consoleSvc: consoleSvc,
		mapper:     mapper{},
		defaulter:  defaulter{},
	}
}

// CreateTopic creates a new Kafka topic.
func (s *Service) CreateTopic(ctx context.Context, req *connect.Request[v1.CreateTopicRequest]) (*connect.Response[v1.CreateTopicResponse], error) {
	kafkaReq := s.mapper.createTopicRequestToKafka(req.Msg)

	kafkaRes, err := s.consoleSvc.CreateTopics(ctx, kafkaReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if len(kafkaRes.Topics) != 1 {
		// Should never happen since we only create one topic, but if it happens we want to err early.
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("unexpected number of results in create topics response"),
			apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
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

	connectResponse := connect.NewResponse(&v1.CreateTopicResponse{
		TopicName:         response.TopicName,
		PartitionCount:    response.PartitionCount,
		ReplicationFactor: response.ReplicationFactor,
	})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusCreated))
	return connectResponse, nil
}

// AddTopicPartitions add partition counts to an existing topic.
func (s *Service) AddTopicPartitions(ctx context.Context, req *connect.Request[v1.AddTopicPartitionsRequest]) (*connect.Response[v1.AddTopicPartitionsResponse], error) {
	topicName := req.Msg.GetTopicName()

	res, err := s.consoleSvc.AddPartitionsToTopics(ctx,
		int(req.Msg.GetPartitionCount()),
		[]string{topicName},
		req.Msg.GetValidateOnly())
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if res[topicName].Err != nil {
		return nil, s.handleKafkaTopicPartitionError(res[topicName].Err, res[topicName].ErrMessage)
	}

	return connect.NewResponse(&v1.AddTopicPartitionsResponse{}), nil
}

// SetTopicPartitions sets partition counts to an existing topic.
func (s *Service) SetTopicPartitions(ctx context.Context, req *connect.Request[v1.SetTopicPartitionsRequest]) (*connect.Response[v1.SetTopicPartitionsResponse], error) {
	topicName := req.Msg.GetTopicName()

	res, err := s.consoleSvc.SetPartitionsToTopics(ctx,
		int(req.Msg.GetPartitionCount()),
		[]string{topicName},
		req.Msg.GetValidateOnly())
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if res[topicName].Err != nil {
		return nil, s.handleKafkaTopicPartitionError(res[topicName].Err, res[topicName].ErrMessage)
	}

	return connect.NewResponse(&v1.SetTopicPartitionsResponse{}), nil
}

// AddPartitionsToTopics add partition counts to topics.
func (s *Service) AddPartitionsToTopics(ctx context.Context, req *connect.Request[v1.AddPartitionsToTopicsRequest]) (*connect.Response[v1.AddPartitionsToTopicsResponse], error) {
	statuses, err := s.consoleSvc.AddPartitionsToTopics(ctx,
		int(req.Msg.GetPartitionCount()),
		req.Msg.GetTopicNames(),
		req.Msg.GetValidateOnly())
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	resMsg := &v1.AddPartitionsToTopicsResponse{
		Statuses: make([]*v1.AlterTopicPartitionStatus, 0, len(statuses)),
	}

	for topicName, result := range statuses {
		errMsg := ""
		err := result.Err
		if err != nil {
			if result.ErrMessage != "" {
				err = fmt.Errorf(result.ErrMessage+": %w", err)
			}

			errMsg = err.Error()
		}

		resMsg.Statuses = append(resMsg.Statuses, &v1.AlterTopicPartitionStatus{
			TopicName: topicName,
			Success:   errMsg == "",
			Error:     errMsg,
		})
	}

	return connect.NewResponse(resMsg), nil
}

// SetPartitionsToTopics sets partition counts to topics.
func (s *Service) SetPartitionsToTopics(ctx context.Context, req *connect.Request[v1.SetPartitionsToTopicsRequest]) (*connect.Response[v1.SetPartitionsToTopicsResponse], error) {
	statuses, err := s.consoleSvc.SetPartitionsToTopics(ctx,
		int(req.Msg.GetPartitionCount()),
		req.Msg.GetTopicNames(),
		req.Msg.GetValidateOnly())
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	resMsg := &v1.SetPartitionsToTopicsResponse{
		Statuses: make([]*v1.AlterTopicPartitionStatus, 0, len(statuses)),
	}

	for topicName, result := range statuses {
		errMsg := ""
		err := result.Err
		if err != nil {
			if result.ErrMessage != "" {
				err = fmt.Errorf(result.ErrMessage+": %w", err)
			}

			errMsg = err.Error()
		}

		resMsg.Statuses = append(resMsg.Statuses, &v1.AlterTopicPartitionStatus{
			TopicName: topicName,
			Success:   errMsg == "",
			Error:     errMsg,
		})
	}

	return connect.NewResponse(resMsg), nil
}
