// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package kafkaconnect implements the KafkaConnect interface for the Connect API.
package kafkaconnect

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/emptypb"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2/dataplanev1alpha2connect"
)

var _ dataplanev1alpha1connect.KafkaConnectServiceHandler = (*Service)(nil)

// Service that implements the KafkaConnect interface. This include the RPCs to Handle the KafkaConnect endpoints
type Service struct {
	targetService dataplanev1alpha2connect.KafkaConnectServiceHandler

	defaulter defaulter
}

// NewService creates a new user service handler.
func NewService(targetService dataplanev1alpha2connect.KafkaConnectServiceHandler) *Service {
	return &Service{
		targetService: targetService,
		defaulter:     defaulter{},
	}
}

// ListConnectors implements the handler for the list connectors operation.
func (s *Service) ListConnectors(ctx context.Context, req *connect.Request[v1alpha1.ListConnectorsRequest]) (*connect.Response[v1alpha1.ListConnectorsResponse], error) {
	s.defaulter.applyListConnectorsRequest(req.Msg)

	pr := mapv1alpha1ToListConnectorsv1alpha2(req.Msg)

	resp, err := s.targetService.ListConnectors(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1alpha1.ListConnectorsResponse{
		Connectors:    mapv1alpha2ConnectorsTov1alpha2(resp.Msg.GetConnectors()),
		NextPageToken: resp.Msg.GetNextPageToken(),
	}), nil
}

// CreateConnector implements the handler for the create connector operation
func (s *Service) CreateConnector(ctx context.Context, req *connect.Request[v1alpha1.CreateConnectorRequest]) (*connect.Response[v1alpha1.CreateConnectorResponse], error) {
	pr := mapv1alpha1ToCreateConnectorv1alpha2(req.Msg)

	resp, err := s.targetService.CreateConnector(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	res := connect.NewResponse(&v1alpha1.CreateConnectorResponse{
		Connector: &v1alpha1.ConnectorSpec{
			Name:   resp.Msg.GetConnector().GetName(),
			Type:   resp.Msg.GetConnector().GetType(),
			Tasks:  mapv1alpha2ConnectorTaskInfoTov1alpha1(resp.Msg.GetConnector().GetTasks()),
			Config: resp.Msg.GetConnector().Config,
		},
	})

	// Set header to 201 created
	res.Header().Set("x-http-code", "201")

	return res, nil
}

// GetConnector implements the handler for the get connector operation
func (s *Service) GetConnector(ctx context.Context, req *connect.Request[v1alpha1.GetConnectorRequest]) (*connect.Response[v1alpha1.GetConnectorResponse], error) {
	pr := mapv1alpha1ToGetConnectorv1alpha2(req.Msg)

	resp, err := s.targetService.GetConnector(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	res := connect.NewResponse(&v1alpha1.GetConnectorResponse{
		Connector: &v1alpha1.ConnectorSpec{
			Name:   resp.Msg.GetConnector().GetName(),
			Type:   resp.Msg.GetConnector().GetType(),
			Tasks:  mapv1alpha2ConnectorTaskInfoTov1alpha1(resp.Msg.GetConnector().GetTasks()),
			Config: resp.Msg.GetConnector().Config,
		},
	})

	return res, nil
}

// GetConnectorStatus implements the handler for the get connector status operation
func (s *Service) GetConnectorStatus(ctx context.Context, req *connect.Request[v1alpha1.GetConnectorStatusRequest]) (*connect.Response[v1alpha1.GetConnectorStatusResponse], error) {
	pr := mapv1alpha1ToGetConnectorStatusv1alpha2(req.Msg)

	resp, err := s.targetService.GetConnectorStatus(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	res := connect.NewResponse(&v1alpha1.GetConnectorStatusResponse{
		Status: mapv1alpha2ConnectorStatusTov1alpha1(resp.Msg.GetStatus()),
	})

	return res, nil
}

// ResumeConnector implements the handler for the resume connector operation
func (s *Service) ResumeConnector(ctx context.Context, req *connect.Request[v1alpha1.ResumeConnectorRequest]) (*connect.Response[emptypb.Empty], error) {
	pr := mapv1alpha1ResumeConnectorv1alpha2(req.Msg)

	_, err := s.targetService.ResumeConnector(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	res := connect.NewResponse(&emptypb.Empty{})
	// Set header to 202 accepted
	res.Header().Set("x-http-code", "202")

	return res, nil
}

// PauseConnector implements the handler for the pause connector operation
func (s *Service) PauseConnector(ctx context.Context, req *connect.Request[v1alpha1.PauseConnectorRequest]) (*connect.Response[emptypb.Empty], error) {
	pr := mapv1alpha1PauseConnectorv1alpha2(req.Msg)

	_, err := s.targetService.PauseConnector(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	res := connect.NewResponse(&emptypb.Empty{})
	// Set header to 202 accepted
	res.Header().Set("x-http-code", "202")

	return res, nil
}

// DeleteConnector implements the handler for the delete connector operation
func (s *Service) DeleteConnector(ctx context.Context, req *connect.Request[v1alpha1.DeleteConnectorRequest]) (*connect.Response[emptypb.Empty], error) {
	pr := mapv1alpha1DeleteConnectorv1alpha2(req.Msg)

	_, err := s.targetService.DeleteConnector(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	res := connect.NewResponse(&emptypb.Empty{})
	// Set header to 204 no content
	res.Header().Set("x-http-code", "204")

	return res, nil
}

// RestartConnector implements the handler for the restart connector operation.
// For now we only return 204 but don't account for the other response codes
// and response bodies
func (s *Service) RestartConnector(ctx context.Context, req *connect.Request[v1alpha1.RestartConnectorRequest]) (*connect.Response[emptypb.Empty], error) {
	pr := mapv1alpha1RestartConnectorv1alpha2(req.Msg)

	_, err := s.targetService.RestartConnector(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	res := connect.NewResponse(&emptypb.Empty{})
	// Set header to 204 no content
	res.Header().Set("x-http-code", "204")
	return res, nil
}

// StopConnector implements the handler for the stop connector operation
func (s *Service) StopConnector(ctx context.Context, req *connect.Request[v1alpha1.StopConnectorRequest]) (*connect.Response[emptypb.Empty], error) {
	pr := mapv1alpha1StopConnectorv1alpha2(req.Msg)

	_, err := s.targetService.StopConnector(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	res := connect.NewResponse(&emptypb.Empty{})
	// Set header to 202 accepted
	res.Header().Set("x-http-code", "202")
	return res, nil
}

// ListConnectClusters implements the handler for the restart connector operation
func (s *Service) ListConnectClusters(ctx context.Context, req *connect.Request[v1alpha1.ListConnectClustersRequest]) (*connect.Response[v1alpha1.ListConnectClustersResponse], error) {
	pr := mapv1alpha1ListConnectClustersv1alpha2(req.Msg)

	resp, err := s.targetService.ListConnectClusters(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1alpha1.ListConnectClustersResponse{
		Clusters: mapv1alpha2ConnectClustersTov1alpha1(resp.Msg.GetClusters()),
	}), nil
}

// GetConnectCluster implements the get connector info operation
func (s *Service) GetConnectCluster(ctx context.Context, req *connect.Request[v1alpha1.GetConnectClusterRequest]) (*connect.Response[v1alpha1.GetConnectClusterResponse], error) {
	pr := mapv1alpha1GetConnectClusterv1alpha2(req.Msg)

	resp, err := s.targetService.GetConnectCluster(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1alpha1.GetConnectClusterResponse{
		Cluster: mapv1alpha2ConnectClusterTov1alpha1(resp.Msg.GetCluster()),
	}), nil
}

// UpsertConnector implements the handler for the upsert connector operation
func (s *Service) UpsertConnector(ctx context.Context, req *connect.Request[v1alpha1.UpsertConnectorRequest]) (*connect.Response[v1alpha1.UpsertConnectorResponse], error) {
	pr := mapv1alpha1UpsertConnectorv1alpha2(req.Msg)

	resp, err := s.targetService.UpsertConnector(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	res := connect.NewResponse(&v1alpha1.UpsertConnectorResponse{
		Connector: mapv1alpha2ConnectorSpecTov1alpha1(resp.Msg.GetConnector()),
	})

	res.Header().Set("x-http-code", resp.Header().Get("x-http-code"))

	return res, nil
}

// GetConnectorConfig implements the handler for the get connector configuration operation
func (s *Service) GetConnectorConfig(ctx context.Context, req *connect.Request[v1alpha1.GetConnectorConfigRequest]) (*connect.Response[v1alpha1.GetConnectorConfigResponse], error) {
	pr := mapv1alpha1GetConnectorConfigv1alpha2(req.Msg)

	resp, err := s.targetService.GetConnectorConfig(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1alpha1.GetConnectorConfigResponse{
		Config: resp.Msg.Config,
	}), nil
}

// ListConnectorTopics implements the handler for the list connector topics
// operation,There is no defined order in which the topics are returned and
// consecutive calls may return the same topic names but in different order
func (s *Service) ListConnectorTopics(ctx context.Context, req *connect.Request[v1alpha1.ListConnectorTopicsRequest]) (*connect.Response[v1alpha1.ListConnectorTopicsResponse], error) {
	pr := mapv1alpha1ListConnectorTopicsv1alpha2(req.Msg)

	resp, err := s.targetService.ListConnectorTopics(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1alpha1.ListConnectorTopicsResponse{
		Topics: resp.Msg.Topics,
	}), nil
}

// ResetConnectorTopics implements the handler for the reset connector topics
// operation, Resets the set of topic names that the connector has been using
// since its creation or since the last time its set of active topics was
// reset.
func (s *Service) ResetConnectorTopics(ctx context.Context, req *connect.Request[v1alpha1.ResetConnectorTopicsRequest]) (*connect.Response[emptypb.Empty], error) {
	pr := mapv1alpha1ResetConnectorTopicsv1alpha2(req.Msg)

	_, err := s.targetService.ResetConnectorTopics(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&emptypb.Empty{}), nil
}
