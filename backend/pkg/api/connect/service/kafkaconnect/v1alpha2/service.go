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
	"errors"
	"fmt"
	"net/http"
	"sort"

	"connectrpc.com/connect"
	"github.com/cloudhut/common/rest"
	con "github.com/cloudhut/connect-client"
	"github.com/redpanda-data/common-go/api/pagination"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/emptypb"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	kafkaconnect "github.com/redpanda-data/console/backend/pkg/connect"
	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2/dataplanev1alpha2connect"
)

var _ dataplanev1alpha2connect.KafkaConnectServiceHandler = (*Service)(nil)

// Service that implements the KafkaConnect interface. This include the RPCs to Handle the KafkaConnect endpoints
type Service struct {
	cfg        *config.Config
	logger     *zap.Logger
	connectSvc *kafkaconnect.Service
	mapper     *mapper
	defaulter  defaulter
}

// NewService creates a new user service handler.
func NewService(cfg *config.Config,
	logger *zap.Logger,
	kafkaConnectSrv *kafkaconnect.Service,
) *Service {
	return &Service{
		cfg:        cfg,
		logger:     logger,
		connectSvc: kafkaConnectSrv,
		mapper:     &mapper{},
		defaulter:  defaulter{},
	}
}

// ListConnectors implements the handler for the list connectors operation.
func (s *Service) ListConnectors(ctx context.Context, req *connect.Request[v1alpha2.ListConnectorsRequest]) (*connect.Response[v1alpha2.ListConnectorsResponse], error) {
	s.defaulter.applyListConnectorsRequest(req.Msg)

	response, err := s.connectSvc.GetClusterConnectors(ctx, req.Msg.ClusterName)
	if err != nil {
		return nil, s.matchError(err)
	}

	s.logger.Info("list connectors for connect cluster", zap.String("cluster", req.Msg.ClusterName))

	listConnectorsResponse, mapperError := s.mapper.connectorsHTTPResponseToProto(response)

	if mapperError != nil {
		s.logger.Error("unable to map list connectors response", zap.Error(mapperError))
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("not able to parse response"),
			apierrors.NewErrorInfo(
				v1alpha2.Reason_REASON_KAFKA_CONNECT_API_ERROR.String(),
			),
		)
	}

	if req.Msg.GetPageSize() > 0 {
		connectors := listConnectorsResponse.Connectors

		sort.SliceStable(connectors, func(i, j int) bool {
			return connectors[i].Name < connectors[j].Name
		})
		page, nextPageToken, err := pagination.SliceToPaginatedWithToken(connectors, int(req.Msg.GetPageSize()), req.Msg.GetPageToken(), "name", func(x *v1alpha2.ListConnectorsResponse_ConnectorInfoStatus) string {
			return x.GetName()
		})
		if err != nil {
			return nil, apierrors.NewConnectError(
				connect.CodeInternal,
				fmt.Errorf("failed to apply pagination: %w", err),
				apierrors.NewErrorInfo(v1alpha2.Reason_REASON_CONSOLE_ERROR.String()),
			)
		}
		listConnectorsResponse.Connectors = page
		listConnectorsResponse.NextPageToken = nextPageToken
	}

	return connect.NewResponse(listConnectorsResponse), nil
}

// CreateConnector implements the handler for the create connector operation
func (s *Service) CreateConnector(ctx context.Context, req *connect.Request[v1alpha2.CreateConnectorRequest]) (*connect.Response[v1alpha2.CreateConnectorResponse], error) {
	kafkaConnectResponse, mapperError := s.mapper.createConnectorProtoToClientRequest(req.Msg)
	if mapperError != nil {
		s.logger.Error("unable to map create connector request", zap.Error(mapperError))
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			errors.New("unable create connector request"),
			apierrors.NewErrorInfo(
				v1alpha2.Reason_REASON_KAFKA_CONNECT_API_ERROR.String(),
			),
		)
	}

	response, err := s.connectSvc.CreateConnector(ctx, req.Msg.ClusterName, *kafkaConnectResponse)
	if err != nil {
		return nil, s.matchError(err)
	}
	res := connect.NewResponse(&v1alpha2.CreateConnectorResponse{
		Connector: &v1alpha2.ConnectorSpec{
			Name:   response.Name,
			Type:   response.Type,
			Tasks:  s.mapper.connectorTaskIDToProto(response.Name, response.Tasks),
			Config: response.Config,
		},
	})

	// Set header to 201 created
	res.Header().Set("x-http-code", "201")

	return res, nil
}

// GetConnector implements the handler for the get connector operation
func (s *Service) GetConnector(ctx context.Context, req *connect.Request[v1alpha2.GetConnectorRequest]) (*connect.Response[v1alpha2.GetConnectorResponse], error) {
	httpRes, err := s.connectSvc.GetConnectorInfo(ctx, req.Msg.ClusterName, req.Msg.Name)
	if err != nil {
		return nil, s.matchError(err)
	}

	res := connect.NewResponse(&v1alpha2.GetConnectorResponse{
		Connector: s.mapper.connectorSpecToProto(httpRes),
	})

	return res, nil
}

// GetConnectorStatus implements the handler for the get connector status operation
func (s *Service) GetConnectorStatus(ctx context.Context, req *connect.Request[v1alpha2.GetConnectorStatusRequest]) (*connect.Response[v1alpha2.GetConnectorStatusResponse], error) {
	httpRes, restErr := s.connectSvc.GetConnectorStatus(ctx, req.Msg.ClusterName, req.Msg.Name)
	if restErr != nil {
		return nil, s.matchError(restErr)
	}

	status, err := s.mapper.connectorStatusToProto(httpRes)
	if err != nil {
		s.logger.Error("error mapping response for connector", zap.Error(err), zap.String("cluster", req.Msg.ClusterName), zap.String("connector", req.Msg.Name))
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(
				v1alpha2.Reason_REASON_KAFKA_CONNECT_API_ERROR.String(),
			),
		)
	}

	res := connect.NewResponse(&v1alpha2.GetConnectorStatusResponse{
		Status: status,
	})

	return res, nil
}

// ResumeConnector implements the handler for the resume connector operation
func (s *Service) ResumeConnector(ctx context.Context, req *connect.Request[v1alpha2.ResumeConnectorRequest]) (*connect.Response[emptypb.Empty], error) {
	if err := s.connectSvc.ResumeConnector(ctx, req.Msg.ClusterName, req.Msg.Name); err != nil {
		return nil, s.matchError(err)
	}

	res := connect.NewResponse(&emptypb.Empty{})
	// Set header to 202 accepted
	res.Header().Set("x-http-code", "202")

	return res, nil
}

// PauseConnector implements the handler for the pause connector operation
func (s *Service) PauseConnector(ctx context.Context, req *connect.Request[v1alpha2.PauseConnectorRequest]) (*connect.Response[emptypb.Empty], error) {
	if err := s.connectSvc.PauseConnector(ctx, req.Msg.ClusterName, req.Msg.Name); err != nil {
		return nil, s.matchError(err)
	}

	res := connect.NewResponse(&emptypb.Empty{})
	// Set header to 202 accepted
	res.Header().Set("x-http-code", "202")

	return res, nil
}

// DeleteConnector implements the handler for the delete connector operation
func (s *Service) DeleteConnector(ctx context.Context, req *connect.Request[v1alpha2.DeleteConnectorRequest]) (*connect.Response[emptypb.Empty], error) {
	// attempt to delete connector
	if err := s.connectSvc.DeleteConnector(ctx, req.Msg.ClusterName, req.Msg.Name); err != nil {
		return nil, s.matchError(err)
	}

	res := connect.NewResponse(&emptypb.Empty{})
	// Set header to 204 no content
	res.Header().Set("x-http-code", "204")

	return res, nil
}

// RestartConnector implements the handler for the restart connector operation.
// For now we only return 204 but don't account for the other response codes
// and response bodies
func (s *Service) RestartConnector(ctx context.Context, req *connect.Request[v1alpha2.RestartConnectorRequest]) (*connect.Response[emptypb.Empty], error) {
	if err := s.connectSvc.RestartConnector(ctx, req.Msg.ClusterName, req.Msg.Name, req.Msg.Options.IncludeTasks, req.Msg.Options.OnlyFailed); err != nil {
		return nil, s.matchError(err)
	}

	res := connect.NewResponse(&emptypb.Empty{})
	// Set header to 204 no content
	res.Header().Set("x-http-code", "204")
	return res, nil
}

// StopConnector implements the handler for the stop connector operation
func (s *Service) StopConnector(ctx context.Context, req *connect.Request[v1alpha2.StopConnectorRequest]) (*connect.Response[emptypb.Empty], error) {
	if err := s.connectSvc.StopConnector(ctx, req.Msg.ClusterName, req.Msg.Name); err != nil {
		return nil, s.matchError(err)
	}

	res := connect.NewResponse(&emptypb.Empty{})
	// Set header to 202 accepted
	res.Header().Set("x-http-code", "202")
	return res, nil
}

// ListConnectClusters implements the handler for the restart connector operation
func (s *Service) ListConnectClusters(ctx context.Context, _ *connect.Request[v1alpha2.ListConnectClustersRequest]) (*connect.Response[v1alpha2.ListConnectClustersResponse], error) {
	clusters := s.connectSvc.GetAllClusterInfo(ctx)

	clustersProto, err := s.mapper.connectorInfoListToProto(clusters)
	if err != nil {
		// We log the error but continue since some of the clusters responses might be correct
		s.logger.Error("there are some errors getting kakfa connect clusters", zap.Error(err))
	}

	return connect.NewResponse(&v1alpha2.ListConnectClustersResponse{
		Clusters: clustersProto,
	}), nil
}

// GetConnectCluster implements the get connector info operation
func (s *Service) GetConnectCluster(ctx context.Context, req *connect.Request[v1alpha2.GetConnectClusterRequest]) (*connect.Response[v1alpha2.GetConnectClusterResponse], error) {
	response, httpErr := s.connectSvc.GetClusterInfo(ctx, req.Msg.ClusterName)
	if httpErr != nil {
		return nil, s.matchError(httpErr)
	}
	return connect.NewResponse(&v1alpha2.GetConnectClusterResponse{
		Cluster: s.mapper.clusterInfoToProto(response),
	}), nil
}

// UpsertConnector implements the handler for the upsert connector operation
func (s *Service) UpsertConnector(ctx context.Context, req *connect.Request[v1alpha2.UpsertConnectorRequest]) (*connect.Response[v1alpha2.UpsertConnectorResponse], error) {
	putConnectorConfigRequest := con.PutConnectorConfigOptions{
		Config: convertStringMapToInterfaceMap(req.Msg.Config),
	}

	isNew := false

	if _, err := s.connectSvc.GetConnectorConfig(ctx, req.Msg.ClusterName, req.Msg.Name); err != nil {
		if err.Status == http.StatusNotFound {
			isNew = true
		}
	}

	conInfo, err := s.connectSvc.PutConnectorConfig(ctx, req.Msg.ClusterName, req.Msg.Name, putConnectorConfigRequest)
	if err != nil {
		return nil, s.matchError(err)
	}

	res := connect.NewResponse(&v1alpha2.UpsertConnectorResponse{
		Connector: s.mapper.connectorSpecToProto(conInfo),
	})

	// Check if connector already exists, if not set header to 201 created
	if isNew {
		res.Header().Set("x-http-code", "201")
	}

	return res, nil
}

// GetConnectorConfig implements the handler for the get connector configuration operation
func (s *Service) GetConnectorConfig(ctx context.Context, req *connect.Request[v1alpha2.GetConnectorConfigRequest]) (*connect.Response[v1alpha2.GetConnectorConfigResponse], error) {
	config, err := s.connectSvc.GetConnectorConfig(ctx, req.Msg.ClusterName, req.Msg.Name)
	if err != nil {
		return nil, s.matchError(err)
	}
	return connect.NewResponse(&v1alpha2.GetConnectorConfigResponse{
		Config: config,
	}), nil
}

// ListConnectorTopics implements the handler for the list connector topics
// operation,There is no defined order in which the topics are returned and
// consecutive calls may return the same topic names but in different order
func (s *Service) ListConnectorTopics(ctx context.Context, req *connect.Request[v1alpha2.ListConnectorTopicsRequest]) (*connect.Response[v1alpha2.ListConnectorTopicsResponse], error) {
	connectorTopics, err := s.connectSvc.ListConnectorTopics(ctx, req.Msg.ClusterName, req.Msg.Name)
	if err != nil {
		return nil, s.matchError(err)
	}
	return connect.NewResponse(&v1alpha2.ListConnectorTopicsResponse{
		Topics: connectorTopics.Topics,
	}), nil
}

// ResetConnectorTopics implements the handler for the reset connector topics
// operation, Resets the set of topic names that the connector has been using
// since its creation or since the last time its set of active topics was
// reset.
func (s *Service) ResetConnectorTopics(ctx context.Context, req *connect.Request[v1alpha2.ResetConnectorTopicsRequest]) (*connect.Response[emptypb.Empty], error) {
	err := s.connectSvc.ResetConnectorTopics(ctx, req.Msg.ClusterName, req.Msg.Name)
	if err != nil {
		return nil, s.matchError(err)
	}

	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (*Service) matchError(err *rest.Error) *connect.Error {
	switch err.Status {
	case http.StatusNotFound:
		return apierrors.NewConnectError(
			connect.CodeNotFound,
			err.Err,
			apierrors.NewErrorInfo(
				v1alpha2.Reason_REASON_KAFKA_CONNECT_API_ERROR.String(),
			),
		)
	case http.StatusConflict:
		return apierrors.NewConnectError(
			connect.CodeAlreadyExists,
			err.Err,
			apierrors.NewErrorInfo(
				v1alpha2.Reason_REASON_KAFKA_CONNECT_API_ERROR.String(),
			),
		)
	case http.StatusBadRequest:
		return apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			err.Err,
			apierrors.NewErrorInfo(
				v1alpha2.Reason_REASON_KAFKA_CONNECT_API_ERROR.String(),
			),
		)
	default:
		return apierrors.NewConnectError(
			connect.CodeInternal,
			err.Err,
			apierrors.NewErrorInfo(
				v1alpha2.Reason_REASON_KAFKA_CONNECT_API_ERROR.String(),
			),
		)
	}
}
