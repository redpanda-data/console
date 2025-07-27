// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package clusterstatus implements RPCs that retrieve high level information
// providing insights about the health and deployed resources on all connected
// clusters and APIs.
package clusterstatus

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"connectrpc.com/connect"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kmsg"
	"golang.org/x/sync/errgroup"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	kafkaconnect "github.com/redpanda-data/console/backend/pkg/connect"
	kafkafactory "github.com/redpanda-data/console/backend/pkg/factory/kafka"
	"github.com/redpanda-data/console/backend/pkg/factory/redpanda"
	"github.com/redpanda-data/console/backend/pkg/factory/schema"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
	"github.com/redpanda-data/console/backend/pkg/version"
)

var _ consolev1alpha1connect.ClusterStatusServiceHandler = (*Service)(nil)

// Service that implements the ClusterStatusServiceHandler interface. This includes all
// RPCs to retrieve cluster information about all connected APIs.
type Service struct {
	cfg    *config.Config
	logger *slog.Logger

	kafkaClientProvider    kafkafactory.ClientFactory
	redpandaClientProvider redpanda.ClientFactory
	schemaClientProvider   schema.ClientFactory
	connectSvc             *kafkaconnect.Service

	kafkaStatusChecker    *kafkaStatusChecker
	redpandaStatusChecker *redpandaStatusChecker
}

// NewService creates a new Service that serves the RPCs for retrieving cluster statuses.
func NewService(
	cfg *config.Config,
	logger *slog.Logger,
	kafkaClientProvider kafkafactory.ClientFactory,
	redpandaClientProvider redpanda.ClientFactory,
	schemaClientProvider schema.ClientFactory,
	connectSvc *kafkaconnect.Service,
) *Service {
	return &Service{
		cfg:    cfg,
		logger: logger,

		kafkaClientProvider:    kafkaClientProvider,
		redpandaClientProvider: redpandaClientProvider,
		schemaClientProvider:   schemaClientProvider,
		connectSvc:             connectSvc,

		kafkaStatusChecker: &kafkaStatusChecker{logger: logger},
	}
}

// GetKafkaInfo retrieves Kafka cluster metadata and API version concurrently,
// aggregates details (such as broker counts, topics, partitions, and replicas),
// and returns a comprehensive Kafka status response.
func (s *Service) GetKafkaInfo(ctx context.Context, _ *connect.Request[v1alpha1.GetKafkaInfoRequest]) (*connect.Response[v1alpha1.GetKafkaInfoResponse], error) {
	_, adminCl, err := s.kafkaClientProvider.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}

	// We use a child context with a shorter timeout because otherwise we'll potentially have very long response
	// times in case of a single broker being down.
	childCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	grp, grpCtx := errgroup.WithContext(childCtx)

	// Fetch cluster metadata
	var metadata kadm.Metadata
	grp.Go(func() error {
		var err error
		metadata, err = adminCl.Metadata(grpCtx)
		return err
	})

	// Fetch Kafka API version
	clusterVersion := "unknown"
	grp.Go(func() error {
		var err error

		apiVersions, err := adminCl.ApiVersions(ctx)
		if err != nil {
			s.logger.Warn("failed to request kafka version", slog.Any("error", err))
		}
		apiVersions.Each(func(versions kadm.BrokerApiVersions) {
			if versions.Err != nil {
				s.logger.Warn("failed to request kafka version", slog.Int("broker_id", int(versions.NodeID)), slog.Any("error", versions.Err))
				return
			}
			clusterVersion = versions.VersionGuess()
		})

		return nil
	})

	if err := grp.Wait(); err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha2.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	partitionCount := int32(0)
	replicaCount := int32(0)
	metadata.Topics.EachPartition(func(p kadm.PartitionDetail) {
		if p.Err != nil {
			return
		}
		partitionCount++
		replicaCount += int32(len(p.Replicas))
	})

	kafkaInfoResponse := &v1alpha1.GetKafkaInfoResponse{
		Status:          s.kafkaStatusChecker.statusFromMetadata(metadata),
		Version:         clusterVersion,
		Distribution:    s.kafkaStatusChecker.distributionFromMetadata(metadata),
		BrokersOnline:   int32(len(metadata.Brokers)),
		BrokersExpected: int32(len(s.kafkaStatusChecker.getExpectedBrokers(metadata))),
		TopicsCount:     int32(len(metadata.Topics)),
		PartitionsCount: partitionCount,
		ReplicasCount:   replicaCount,
		ControllerId:    metadata.Controller,
		Brokers:         s.kafkaStatusChecker.brokersFromMetadata(metadata),
		ClusterId:       metadata.Cluster,
	}

	return connect.NewResponse(kafkaInfoResponse), nil
}

// GetKafkaAuthorizerInfo fetches Kafka ACLs using a describe request and
// returns the total count of ACL resources, converting any Kafka API errors
// into ConnectRPC errors.
func (s *Service) GetKafkaAuthorizerInfo(ctx context.Context, _ *connect.Request[v1alpha1.GetKafkaAuthorizerInfoRequest]) (*connect.Response[v1alpha1.GetKafkaAuthorizerInfoResponse], error) {
	kafkaCl, _, err := s.kafkaClientProvider.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}

	listAllReq := kmsg.NewDescribeACLsRequest()
	listAllReq.ResourcePatternType = kmsg.ACLResourcePatternTypeAny
	listAllReq.Operation = kmsg.ACLOperationAny
	listAllReq.PermissionType = kmsg.ACLPermissionTypeAny
	listAllReq.ResourceType = kmsg.ACLResourceTypeAny

	aclResponses, err := listAllReq.RequestWith(ctx, kafkaCl)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha2.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	connectErr := apierrors.NewConnectErrorFromKafkaErrorCode(aclResponses.ErrorCode, aclResponses.ErrorMessage)
	if connectErr != nil {
		return nil, connectErr
	}

	return connect.NewResponse(&v1alpha1.GetKafkaAuthorizerInfoResponse{AclCount: int32(len(aclResponses.Resources))}), nil
}

// GetRedpandaInfo retrieves cluster information from the Redpanda Admin API,
// including cluster version (determined via brokers) and user count, while
// enforcing a short timeout to mitigate long delays.
func (s *Service) GetRedpandaInfo(ctx context.Context, _ *connect.Request[v1alpha1.GetRedpandaInfoRequest]) (*connect.Response[v1alpha1.GetRedpandaInfoResponse], error) {
	// Try to retrieve a Redpanda Admin API client.
	redpandaCl, err := s.redpandaClientProvider.GetRedpandaAPIClient(ctx)
	if err != nil {
		return nil, err
	}

	// We use a child context with a shorter timeout because otherwise we'll potentially have very long response
	// times in case of a single broker being down.
	childCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	grp, grpCtx := errgroup.WithContext(childCtx)

	version := "unknown"
	grp.Go(func() error {
		brokers, err := redpandaCl.Brokers(grpCtx)
		if err != nil {
			s.logger.Warn("failed to request redpanda brokers", slog.Any("error", err))
		} else {
			version = s.redpandaStatusChecker.clusterVersionFromBrokerList(brokers)
		}
		return nil
	})

	userCount := int32(-1)
	grp.Go(func() error {
		users, err := redpandaCl.ListUsers(ctx)
		if err != nil {
			s.logger.Warn("failed to list users via redpanda admin api", slog.Any("error", err))
		} else {
			userCount = int32(len(users))
		}
		return nil
	})

	// No error is returned, errors are already logged inside each go routine
	_ = grp.Wait()

	redpandaOverview := v1alpha1.GetRedpandaInfoResponse{
		Version:   version,
		UserCount: userCount,
	}

	return connect.NewResponse(&redpandaOverview), nil
}

// GetRedpandaPartitionBalancerStatus obtains the partition balancer status
// from the Redpanda Admin API, converts it to the corresponding protobuf
// response, and handles any associated errors.
func (s *Service) GetRedpandaPartitionBalancerStatus(ctx context.Context, _ *connect.Request[v1alpha1.GetRedpandaPartitionBalancerStatusRequest]) (*connect.Response[v1alpha1.GetRedpandaPartitionBalancerStatusResponse], error) {
	// Try to retrieve a Redpanda Admin API client.
	redpandaCl, err := s.redpandaClientProvider.GetRedpandaAPIClient(ctx)
	if err != nil {
		return nil, err
	}

	pbs, err := redpandaCl.GetPartitionStatus(ctx)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "failed retrieving partition balancer status: ")
	}

	protoStatus := s.redpandaStatusChecker.partitionBalancerStatusToProto(&pbs)

	return connect.NewResponse(protoStatus), nil
}

// GetConsoleInfo returns version and build timestamp information for Console.
func (*Service) GetConsoleInfo(context.Context, *connect.Request[v1alpha1.GetConsoleInfoRequest]) (*connect.Response[v1alpha1.GetConsoleInfoResponse], error) {
	return connect.NewResponse(&v1alpha1.GetConsoleInfoResponse{
		Version: version.Version,
		BuiltAt: version.BuiltAt,
	}), nil
}

// GetKafkaConnectInfo retrieves information from all configured Kafka KafkaConnect
// clusters, including cluster name, host, version, health status, and the count
// of installed plugins, while ensuring that Kafka KafkaConnect is enabled.
func (s *Service) GetKafkaConnectInfo(ctx context.Context, _ *connect.Request[v1alpha1.GetKafkaConnectInfoRequest]) (*connect.Response[v1alpha1.GetKafkaConnectInfoResponse], error) {
	// Currently the connectSvc is always configured, even if it's not enabled.
	// The connectSvc itself will then return errors if you request resources in
	// case it hasn't been enabled in the configuration. Hence, we have to check
	// whether the Kafka connect config is enabled.
	if s.connectSvc == nil || !s.connectSvc.Cfg.Enabled {
		return nil, apierrors.NewKafkaConnectNotConfiguredError()
	}

	// Get cluster info from all clusters
	clustersInfo := s.connectSvc.GetAllClusterInfo(ctx)
	clustersOverview := make([]*v1alpha1.GetKafkaConnectInfoResponse_KafkaConnectCluster, len(clustersInfo))

	for i, clusterInfo := range clustersInfo {
		status := &v1alpha1.ComponentStatus{Status: v1alpha1.StatusType_STATUS_TYPE_HEALTHY}
		if clusterInfo.RequestError != nil {
			status = &v1alpha1.ComponentStatus{Status: v1alpha1.StatusType_STATUS_TYPE_UNHEALTHY, StatusReason: clusterInfo.RequestError.Error()}
		}
		clustersOverview[i] = &v1alpha1.GetKafkaConnectInfoResponse_KafkaConnectCluster{
			Name:                  clusterInfo.Name,
			Status:                status,
			Host:                  clusterInfo.Host,
			Version:               clusterInfo.Version,
			InstalledPluginsCount: int32(len(clusterInfo.Plugins)),
		}
	}
	return connect.NewResponse(&v1alpha1.GetKafkaConnectInfoResponse{
		Clusters: clustersOverview,
	}), nil
}

// GetSchemaRegistryInfo obtains the status of the Schema Registry and the number
// of registered subjects. It reports an unhealthy status if subjects cannot be
// fetched, ensuring that errors are properly reflected in the response.
func (s *Service) GetSchemaRegistryInfo(ctx context.Context, _ *connect.Request[v1alpha1.GetSchemaRegistryInfoRequest]) (*connect.Response[v1alpha1.GetSchemaRegistryInfoResponse], error) {
	if !s.cfg.SchemaRegistry.Enabled {
		return nil, apierrors.NewSchemaRegistryNotConfiguredError()
	}

	status := &v1alpha1.ComponentStatus{
		Status:       v1alpha1.StatusType_STATUS_TYPE_HEALTHY,
		StatusReason: "",
	}

	srClient, err := s.schemaClientProvider.GetSchemaRegistryClient(ctx)
	if err != nil {
		return nil, err
	}

	registeredSubjects := int32(0)
	subjects, err := srClient.Subjects(ctx)
	if err != nil {
		setStatus(status, v1alpha1.StatusType_STATUS_TYPE_UNHEALTHY, fmt.Sprintf("Could not fetch subjects from schema registry %q", err.Error()))
	} else {
		registeredSubjects = int32(len(subjects))
	}

	info := v1alpha1.GetSchemaRegistryInfoResponse{
		Status:                  status,
		RegisteredSubjectsCount: registeredSubjects,
	}

	return connect.NewResponse(&info), nil
}
