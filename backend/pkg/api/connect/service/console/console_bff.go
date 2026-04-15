// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"fmt"
	"net/http"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"connectrpc.com/connect"
	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kmsg"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	v1alpha "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	dataplane "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
)

// restErrorToConnectError converts a rest.Error to a connect error.
func restErrorToConnectError(restErr *rest.Error) *connect.Error {
	if restErr == nil {
		return nil
	}

	code := connect.CodeInternal
	switch restErr.Status {
	case http.StatusNotFound:
		code = connect.CodeNotFound
	case http.StatusBadRequest:
		code = connect.CodeInvalidArgument
	case http.StatusForbidden:
		code = connect.CodePermissionDenied
	case http.StatusServiceUnavailable:
		code = connect.CodeUnavailable
	}

	return apierrors.NewConnectError(
		code,
		restErr.Err,
		apierrors.NewErrorInfo(dataplane.Reason_REASON_CONSOLE_ERROR.String()),
	)
}

// ListConsumerGroups returns an overview of all consumer groups.
func (api *Service) ListConsumerGroups(
	ctx context.Context,
	_ *connect.Request[v1alpha.ListConsumerGroupsRequest],
) (*connect.Response[v1alpha.ListConsumerGroupsResponse], error) {
	groups, restErr := api.consoleSvc.GetConsumerGroupsOverview(ctx, nil)
	if restErr != nil {
		return nil, restErrorToConnectError(restErr)
	}

	protoGroups := make([]*v1alpha.ConsumerGroupOverview, 0, len(groups))
	for _, g := range groups {
		protoGroups = append(protoGroups, consumerGroupOverviewToProto(&g))
	}

	return connect.NewResponse(&v1alpha.ListConsumerGroupsResponse{
		ConsumerGroups: protoGroups,
	}), nil
}

// GetConsumerGroup returns the overview for a single consumer group.
func (api *Service) GetConsumerGroup(
	ctx context.Context,
	req *connect.Request[v1alpha.GetConsumerGroupRequest],
) (*connect.Response[v1alpha.GetConsumerGroupResponse], error) {
	groupID := req.Msg.GetGroupId()
	if groupID == "" {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			fmt.Errorf("group_id is required"),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	groups, restErr := api.consoleSvc.GetConsumerGroupsOverview(ctx, []string{groupID})
	if restErr != nil {
		return nil, restErrorToConnectError(restErr)
	}

	var cg *v1alpha.ConsumerGroupOverview
	if len(groups) == 1 {
		cg = consumerGroupOverviewToProto(&groups[0])
	}

	return connect.NewResponse(&v1alpha.GetConsumerGroupResponse{
		ConsumerGroup: cg,
	}), nil
}

// ListBrokers returns all brokers with their log dir information.
func (api *Service) ListBrokers(
	ctx context.Context,
	_ *connect.Request[v1alpha.ListBrokersRequest],
) (*connect.Response[v1alpha.ListBrokersResponse], error) {
	brokers, err := api.consoleSvc.GetBrokersWithLogDirs(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("failed to retrieve broker list: %w", err),
			apierrors.NewErrorInfo(dataplane.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	protoBrokers := make([]*v1alpha.BrokerWithLogDirs, 0, len(brokers))
	for _, b := range brokers {
		protoBrokers = append(protoBrokers, brokerWithLogDirsToProto(&b))
	}

	return connect.NewResponse(&v1alpha.ListBrokersResponse{
		Brokers: protoBrokers,
	}), nil
}

// DescribeCluster returns cluster-level information including brokers and configs.
func (api *Service) DescribeCluster(
	ctx context.Context,
	_ *connect.Request[v1alpha.DescribeClusterRequest],
) (*connect.Response[v1alpha.DescribeClusterResponse], error) {
	clusterInfo, err := api.consoleSvc.GetClusterInfo(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("could not describe cluster: %w", err),
			apierrors.NewErrorInfo(dataplane.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	return connect.NewResponse(&v1alpha.DescribeClusterResponse{
		ClusterInfo: clusterInfoToProto(clusterInfo),
	}), nil
}

// GetTopicsOverview returns a summary overview of all topics.
func (api *Service) GetTopicsOverview(
	ctx context.Context,
	_ *connect.Request[v1alpha.GetTopicsOverviewRequest],
) (*connect.Response[v1alpha.GetTopicsOverviewResponse], error) {
	topics, err := api.consoleSvc.GetTopicsOverview(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("could not list topics from Kafka cluster: %w", err),
			apierrors.NewErrorInfo(dataplane.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	protoTopics := make([]*v1alpha.TopicSummary, 0, len(topics))
	for _, t := range topics {
		protoTopics = append(protoTopics, topicSummaryToProto(t))
	}

	return connect.NewResponse(&v1alpha.GetTopicsOverviewResponse{
		Topics: protoTopics,
	}), nil
}

// ListTopicPartitionDetails returns partition details for a single topic.
func (api *Service) ListTopicPartitionDetails(
	ctx context.Context,
	req *connect.Request[v1alpha.ListTopicPartitionDetailsRequest],
) (*connect.Response[v1alpha.ListTopicPartitionDetailsResponse], error) {
	topicName := req.Msg.GetTopicName()
	if topicName == "" {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			fmt.Errorf("topic_name is required"),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	topicDetails, restErr := api.consoleSvc.GetTopicDetails(ctx, []string{topicName})
	if restErr != nil {
		return nil, restErrorToConnectError(restErr)
	}

	if len(topicDetails) != 1 {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("expected exactly one topic detail in response, but got '%d'", len(topicDetails)),
			apierrors.NewErrorInfo(dataplane.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	protoPartitions := make([]*v1alpha.TopicPartitionDetail, 0, len(topicDetails[0].Partitions))
	for _, p := range topicDetails[0].Partitions {
		protoPartitions = append(protoPartitions, topicPartitionDetailToProto(&p))
	}

	return connect.NewResponse(&v1alpha.ListTopicPartitionDetailsResponse{
		TopicName:  topicName,
		Partitions: protoPartitions,
	}), nil
}

// GetTopicsConfigs returns configuration for one or more topics.
func (api *Service) GetTopicsConfigs(
	ctx context.Context,
	req *connect.Request[v1alpha.GetTopicsConfigsRequest],
) (*connect.Response[v1alpha.GetTopicsConfigsResponse], error) {
	topicNames := req.Msg.GetTopicNames()
	configKeys := req.Msg.GetConfigKeys()

	// If no topic names specified, fetch all topic names
	if len(topicNames) == 0 {
		var err error
		topicNames, err = api.consoleSvc.GetAllTopicNames(ctx)
		if err != nil {
			return nil, apierrors.NewConnectError(
				connect.CodePermissionDenied,
				fmt.Errorf("failed to request metadata to fetch topic names: %w", err),
				apierrors.NewErrorInfo(dataplane.Reason_REASON_CONSOLE_ERROR.String()),
			)
		}
	}

	descriptions, err := api.consoleSvc.GetTopicsConfigs(ctx, topicNames, configKeys)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeUnavailable,
			fmt.Errorf("failed to describe topic configs: %w", err),
			apierrors.NewErrorInfo(dataplane.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	protoConfigs := make([]*v1alpha.TopicConfig, 0, len(descriptions))
	for _, desc := range descriptions {
		protoConfigs = append(protoConfigs, topicConfigToProto(desc))
	}

	return connect.NewResponse(&v1alpha.GetTopicsConfigsResponse{
		TopicConfigs: protoConfigs,
	}), nil
}

// ListTopicConsumerGroups lists consumer groups consuming from a given topic.
func (api *Service) ListTopicConsumerGroups(
	ctx context.Context,
	req *connect.Request[v1alpha.ListTopicConsumerGroupsRequest],
) (*connect.Response[v1alpha.ListTopicConsumerGroupsResponse], error) {
	topicName := req.Msg.GetTopicName()
	if topicName == "" {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			fmt.Errorf("topic_name is required"),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	consumers, err := api.consoleSvc.ListTopicConsumers(ctx, topicName)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("could not list topic consumers for requested topic: %w", err),
			apierrors.NewErrorInfo(dataplane.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	protoConsumers := make([]*v1alpha.TopicConsumerGroup, 0, len(consumers))
	for _, c := range consumers {
		protoConsumers = append(protoConsumers, &v1alpha.TopicConsumerGroup{
			GroupId:   c.GroupID,
			SummedLag: c.SummedLag,
		})
	}

	return connect.NewResponse(&v1alpha.ListTopicConsumerGroupsResponse{
		TopicName: topicName,
		Consumers: protoConsumers,
	}), nil
}

// GetAllTopicDetails returns partition details for all (or specified) topics.
func (api *Service) GetAllTopicDetails(
	ctx context.Context,
	req *connect.Request[v1alpha.GetAllTopicDetailsRequest],
) (*connect.Response[v1alpha.GetAllTopicDetailsResponse], error) {
	topicNames := req.Msg.GetTopicNames()

	// Pass nil for empty slice to match REST behavior (fetch all)
	var names []string
	if len(topicNames) > 0 {
		names = topicNames
	}

	topicDetails, restErr := api.consoleSvc.GetTopicDetails(ctx, names)
	if restErr != nil {
		return nil, restErrorToConnectError(restErr)
	}

	protoTopics := make([]*v1alpha.TopicDetails, 0, len(topicDetails))
	for _, td := range topicDetails {
		protoPartitions := make([]*v1alpha.TopicPartitionDetail, 0, len(td.Partitions))
		for _, p := range td.Partitions {
			protoPartitions = append(protoPartitions, topicPartitionDetailToProto(&p))
		}
		protoTopics = append(protoTopics, &v1alpha.TopicDetails{
			TopicName:  td.TopicName,
			Error:      td.Error,
			Partitions: protoPartitions,
		})
	}

	return connect.NewResponse(&v1alpha.GetAllTopicDetailsResponse{
		Topics: protoTopics,
	}), nil
}

// ListPartitionReassignments lists active partition reassignments.
func (api *Service) ListPartitionReassignments(
	ctx context.Context,
	_ *connect.Request[v1alpha.ListPartitionReassignmentsRequest],
) (*connect.Response[v1alpha.ListPartitionReassignmentsResponse], error) {
	reassignments, err := api.consoleSvc.ListPartitionReassignments(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("could not list active partition reassignments: %w", err),
			apierrors.NewErrorInfo(dataplane.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	protoTopics := make([]*v1alpha.PartitionReassignment, 0, len(reassignments))
	for _, r := range reassignments {
		protoPartitions := make([]*v1alpha.PartitionReassignmentPartition, 0, len(r.Partitions))
		for _, p := range r.Partitions {
			protoPartitions = append(protoPartitions, &v1alpha.PartitionReassignmentPartition{
				PartitionId:      p.PartitionID,
				AddingReplicas:   p.AddingReplicas,
				RemovingReplicas: p.RemovingReplicas,
				Replicas:         p.Replicas,
			})
		}
		protoTopics = append(protoTopics, &v1alpha.PartitionReassignment{
			TopicName:  r.TopicName,
			Partitions: protoPartitions,
		})
	}

	return connect.NewResponse(&v1alpha.ListPartitionReassignmentsResponse{
		Topics: protoTopics,
	}), nil
}

// AlterPartitionAssignments changes partition-to-broker assignments.
func (api *Service) AlterPartitionAssignments(
	ctx context.Context,
	req *connect.Request[v1alpha.AlterPartitionAssignmentsRequest],
) (*connect.Response[v1alpha.AlterPartitionAssignmentsResponse], error) {
	protoTopics := req.Msg.GetTopics()
	if len(protoTopics) == 0 {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			fmt.Errorf("at least one topic and partition must be set"),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	kmsgReq := make([]kmsg.AlterPartitionAssignmentsRequestTopic, len(protoTopics))
	for i, topic := range protoTopics {
		partitions := make([]kmsg.AlterPartitionAssignmentsRequestTopicPartition, len(topic.GetPartitions()))
		for j, partition := range topic.GetPartitions() {
			partitionReq := kmsg.NewAlterPartitionAssignmentsRequestTopicPartition()
			partitionReq.Partition = partition.GetPartitionId()
			partitionReq.Replicas = partition.GetReplicas()
			partitions[j] = partitionReq
		}
		topicReq := kmsg.NewAlterPartitionAssignmentsRequestTopic()
		topicReq.Topic = topic.GetTopicName()
		topicReq.Partitions = partitions
		kmsgReq[i] = topicReq
	}

	results, err := api.consoleSvc.AlterPartitionAssignments(ctx, kmsgReq)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("reassign partition request has failed: %w", err),
			apierrors.NewErrorInfo(dataplane.Reason_REASON_CONSOLE_ERROR.String()),
		)
	}

	protoResults := make([]*v1alpha.AlterPartitionAssignmentsTopicResponse, 0, len(results))
	for _, r := range results {
		protoPartitions := make([]*v1alpha.AlterPartitionAssignmentsPartitionResponse, 0, len(r.Partitions))
		for _, p := range r.Partitions {
			protoPartitions = append(protoPartitions, &v1alpha.AlterPartitionAssignmentsPartitionResponse{
				PartitionId:  p.PartitionID,
				ErrorCode:    p.ErrorCode,
				ErrorMessage: p.ErrorMessage,
			})
		}
		protoResults = append(protoResults, &v1alpha.AlterPartitionAssignmentsTopicResponse{
			TopicName:  r.TopicName,
			Partitions: protoPartitions,
		})
	}

	return connect.NewResponse(&v1alpha.AlterPartitionAssignmentsResponse{
		Topics: protoResults,
	}), nil
}

// IncrementalAlterConfigs incrementally alters resource configurations.
func (api *Service) IncrementalAlterConfigs(
	ctx context.Context,
	req *connect.Request[v1alpha.IncrementalAlterConfigsRequest],
) (*connect.Response[v1alpha.IncrementalAlterConfigsResponse], error) {
	protoResources := req.Msg.GetResources()
	if len(protoResources) == 0 {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			fmt.Errorf("at least one resource must be set"),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	kmsgReq := make([]kmsg.IncrementalAlterConfigsRequestResource, len(protoResources))
	for i, resource := range protoResources {
		alterResource := kmsg.NewIncrementalAlterConfigsRequestResource()
		alterResource.ResourceType = kmsg.ConfigResourceType(resource.GetResourceType())
		alterResource.ResourceName = resource.GetResourceName()
		cfgReqs := make([]kmsg.IncrementalAlterConfigsRequestResourceConfig, len(resource.GetConfigs()))
		for j, cfg := range resource.GetConfigs() {
			cfgReq := kmsg.NewIncrementalAlterConfigsRequestResourceConfig()
			cfgReq.Name = cfg.GetName()
			cfgReq.Op = kmsg.IncrementalAlterConfigOp(cfg.GetOp())
			cfgReq.Value = cfg.Value
			cfgReqs[j] = cfgReq
		}
		alterResource.Configs = cfgReqs
		kmsgReq[i] = alterResource
	}

	results, restErr := api.consoleSvc.IncrementalAlterConfigs(ctx, kmsgReq)
	if restErr != nil {
		return nil, restErrorToConnectError(restErr)
	}

	protoResults := make([]*v1alpha.IncrementalAlterConfigsResourceResponse, 0, len(results))
	for _, r := range results {
		protoResults = append(protoResults, &v1alpha.IncrementalAlterConfigsResourceResponse{
			Error:        r.Error,
			ResourceName: r.ResourceName,
			ResourceType: int32(r.ResourceType),
		})
	}

	return connect.NewResponse(&v1alpha.IncrementalAlterConfigsResponse{
		Resources: protoResults,
	}), nil
}
