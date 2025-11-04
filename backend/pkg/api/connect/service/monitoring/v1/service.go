// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package monitoring contains all handlers for the monitoring endpoints
package monitoring

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	adminv2 "buf.build/gen/go/redpandadata/core/protocolbuffers/go/redpanda/core/admin/v2"
	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/durationpb"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	redpandafactory "github.com/redpanda-data/console/backend/pkg/factory/redpanda"
	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
)

const defaultLimit = uint32(30)

var _ dataplanev1connect.MonitoringServiceHandler = (*Service)(nil)

var orderOptionMap = map[v1.ListConnectionsRequest_OrderingOption]string{
	v1.ListConnectionsRequest_ORDERING_OPTION_OPEN_TIME:                      "open_time",
	v1.ListConnectionsRequest_ORDERING_OPTION_CLOSE_TIME:                     "close_time",
	v1.ListConnectionsRequest_ORDERING_OPTION_IDLE_DURATION:                  "idle_duration",
	v1.ListConnectionsRequest_ORDERING_OPTION_TOTAL_PRODUCE_THROUGHPUT:       "total_request_statistics.produce_bytes",
	v1.ListConnectionsRequest_ORDERING_OPTION_TOTAL_FETCH_THROUGHPUT:         "total_request_statistics.fetch_bytes",
	v1.ListConnectionsRequest_ORDERING_OPTION_TOTAL_REQUESTS:                 "total_request_statistics.request_count",
	v1.ListConnectionsRequest_ORDERING_OPTION_LAST_MINUTE_PRODUCE_THROUGHPUT: "recent_request_statistics.produce_bytes",
	v1.ListConnectionsRequest_ORDERING_OPTION_LAST_MINUTE_FETCH_THROUGHPUT:   "recent_request_statistics.fetch_bytes",
	v1.ListConnectionsRequest_ORDERING_OPTION_LAST_MINUTE_REQUESTS:           "recent_request_statistics.request_count",
}

var connectionStateMap = map[adminv2.KafkaConnectionState]v1.KafkaConnectionState{
	adminv2.KafkaConnectionState_KAFKA_CONNECTION_STATE_OPEN:     v1.KafkaConnectionState_KAFKA_CONNECTION_STATE_OPEN,
	adminv2.KafkaConnectionState_KAFKA_CONNECTION_STATE_ABORTING: v1.KafkaConnectionState_KAFKA_CONNECTION_STATE_ABORTING,
	adminv2.KafkaConnectionState_KAFKA_CONNECTION_STATE_CLOSED:   v1.KafkaConnectionState_KAFKA_CONNECTION_STATE_CLOSED,
}

var authenticationStateMap = map[adminv2.AuthenticationState]v1.AuthenticationState{
	adminv2.AuthenticationState_AUTHENTICATION_STATE_SUCCESS:         v1.AuthenticationState_AUTHENTICATION_STATE_SUCCESS,
	adminv2.AuthenticationState_AUTHENTICATION_STATE_FAILURE:         v1.AuthenticationState_AUTHENTICATION_STATE_FAILURE,
	adminv2.AuthenticationState_AUTHENTICATION_STATE_UNAUTHENTICATED: v1.AuthenticationState_AUTHENTICATION_STATE_UNAUTHENTICATED,
}

var authenticationMechanismMap = map[adminv2.AuthenticationMechanism]v1.AuthenticationMechanism{
	adminv2.AuthenticationMechanism_AUTHENTICATION_MECHANISM_MTLS:             v1.AuthenticationMechanism_AUTHENTICATION_MECHANISM_MTLS,
	adminv2.AuthenticationMechanism_AUTHENTICATION_MECHANISM_SASL_SCRAM:       v1.AuthenticationMechanism_AUTHENTICATION_MECHANISM_SASL_SCRAM,
	adminv2.AuthenticationMechanism_AUTHENTICATION_MECHANISM_SASL_OAUTHBEARER: v1.AuthenticationMechanism_AUTHENTICATION_MECHANISM_SASL_OAUTHBEARER,
	adminv2.AuthenticationMechanism_AUTHENTICATION_MECHANISM_SASL_PLAIN:       v1.AuthenticationMechanism_AUTHENTICATION_MECHANISM_SASL_PLAIN,
	adminv2.AuthenticationMechanism_AUTHENTICATION_MECHANISM_SASL_GSSAPI:      v1.AuthenticationMechanism_AUTHENTICATION_MECHANISM_SASL_GSSAPI,
}

// Service implements MonitoringServiceHandler
type Service struct {
	cfg                   *config.Config
	logger                *slog.Logger
	redpandaClientFactory redpandafactory.ClientFactory
}

// NewService instantiates a new Service
func NewService(cfg *config.Config, logger *slog.Logger, redpandaClientFactory redpandafactory.ClientFactory) *Service {
	return &Service{cfg: cfg, logger: logger, redpandaClientFactory: redpandaClientFactory}
}

func kafkaAPIFromKey(key int32) v1.KafkaAPI {
	val, ok := map[int32]v1.KafkaAPI{
		0:  v1.KafkaAPI_KAFKA_API_PRODUCE,
		1:  v1.KafkaAPI_KAFKA_API_FETCH,
		2:  v1.KafkaAPI_KAFKA_API_OFFSETS,
		3:  v1.KafkaAPI_KAFKA_API_METADATA,
		4:  v1.KafkaAPI_KAFKA_API_LEADER_AND_ISR,
		5:  v1.KafkaAPI_KAFKA_API_STOP_REPLICA,
		6:  v1.KafkaAPI_KAFKA_API_UPDATE_METADATA,
		7:  v1.KafkaAPI_KAFKA_API_CONTROLLED_SHUTDOWN,
		8:  v1.KafkaAPI_KAFKA_API_OFFSET_COMMIT,
		9:  v1.KafkaAPI_KAFKA_API_OFFSET_FETCH,
		10: v1.KafkaAPI_KAFKA_API_GROUP_COORDINATOR,
		12: v1.KafkaAPI_KAFKA_API_JOIN_GROUP,
		13: v1.KafkaAPI_KAFKA_API_HEARTBEAT,
		14: v1.KafkaAPI_KAFKA_API_LEAVE_GROUP,
		15: v1.KafkaAPI_KAFKA_API_SYNC_GROUP,
		16: v1.KafkaAPI_KAFKA_API_DESCRIBE_GROUPS,
		17: v1.KafkaAPI_KAFKA_API_LIST_GROUPS,
		18: v1.KafkaAPI_KAFKA_API_SASL_HANDSHAKE,
		19: v1.KafkaAPI_KAFKA_API_API_VERSIONS,
		20: v1.KafkaAPI_KAFKA_API_CREATE_TOPICS,
		21: v1.KafkaAPI_KAFKA_API_DELETE_TOPICS,
	}[key]

	if !ok {
		return v1.KafkaAPI_KAFKA_API_UNSPECIFIED
	}
	return val
}

func adminConnectionToConnect(conn *adminv2.KafkaConnection) *v1.ListConnectionsResponse_Connection {
	// Convert the current requests into our format
	var currentRequests []*v1.ListConnectionsResponse_ActiveRequests_Request
	if conn.InFlightRequests != nil && conn.InFlightRequests.SampledInFlightRequests != nil {
		currentRequests = make([]*v1.ListConnectionsResponse_ActiveRequests_Request, len(conn.InFlightRequests.SampledInFlightRequests))
		for i, req := range conn.InFlightRequests.SampledInFlightRequests {
			currentRequests[i] = &v1.ListConnectionsResponse_ActiveRequests_Request{
				Api:      kafkaAPIFromKey(req.ApiKey),
				Duration: req.InFlightDuration,
			}
		}
	}

	apiVersions := []*v1.ListConnectionsResponse_APIVersion{}
	for key, ver := range conn.ApiVersions {
		apiVersions = append(apiVersions, &v1.ListConnectionsResponse_APIVersion{
			Api:     kafkaAPIFromKey(key),
			Version: ver,
		})
	}

	// Calculate how long the connection has been open
	opened := conn.OpenTime.AsTime()
	closed := conn.CloseTime.AsTime()
	duration := closed.Sub(opened)
	if opened.After(closed) {
		duration = time.Since(opened)
	}

	client := &v1.ListConnectionsResponse_ConnectionClient{
		Id:              conn.ClientId,
		SoftwareName:    conn.ClientSoftwareName,
		SoftwareVersion: conn.ClientSoftwareVersion,
	}

	if conn.Source != nil {
		client.Ip = conn.Source.IpAddress
		client.Port = conn.Source.Port
	}

	state, ok := connectionStateMap[conn.State]
	if !ok {
		state = v1.KafkaConnectionState_KAFKA_CONNECTION_STATE_UNSPECIFIED
	}

	authInfo := &v1.ListConnectionsResponse_AuthenticationInfo{}
	if conn.AuthenticationInfo != nil {
		authInfo.UserPrincipal = conn.AuthenticationInfo.UserPrincipal
		authInfo.State = v1.AuthenticationState_AUTHENTICATION_STATE_UNSPECIFIED
		authInfo.Mechanism = v1.AuthenticationMechanism_AUTHENTICATION_MECHANISM_UNSPECIFIED

		if val, ok := authenticationStateMap[conn.AuthenticationInfo.State]; ok {
			authInfo.State = val
		}

		if val, ok := authenticationMechanismMap[conn.AuthenticationInfo.Mechanism]; ok {
			authInfo.Mechanism = val
		}
	}

	allRequests := &v1.ListConnectionsResponse_RequestStatistics{}
	if conn.TotalRequestStatistics != nil {
		allRequests.ProduceBytes = conn.TotalRequestStatistics.ProduceBytes
		allRequests.FetchBytes = conn.TotalRequestStatistics.FetchBytes
		allRequests.RequestCount = conn.TotalRequestStatistics.RequestCount
		allRequests.ProduceBatchCount = conn.TotalRequestStatistics.ProduceBatchCount
	}

	recentRequests := &v1.ListConnectionsResponse_RequestStatistics{}
	if conn.RecentRequestStatistics != nil {
		recentRequests.ProduceBytes = conn.RecentRequestStatistics.ProduceBytes
		recentRequests.FetchBytes = conn.RecentRequestStatistics.FetchBytes
		recentRequests.RequestCount = conn.RecentRequestStatistics.RequestCount
		recentRequests.ProduceBatchCount = conn.RecentRequestStatistics.ProduceBatchCount
	}

	return &v1.ListConnectionsResponse_Connection{
		NodeId:             conn.NodeId,
		ShardId:            conn.ShardId,
		Uid:                conn.Uid,
		State:              state,
		Authentication:     authInfo,
		OpenTime:           conn.OpenTime,
		CloseTime:          conn.CloseTime,
		ConnectionDuration: durationpb.New(duration),
		IdleDuration:       conn.IdleDuration,
		TlsEnabled:         conn.TlsInfo != nil && conn.TlsInfo.Enabled,
		Client:             client,
		Group: &v1.ListConnectionsResponse_GroupInfo{
			Id:         conn.GroupId,
			InstanceId: conn.GroupInstanceId,
			MemberId:   conn.GroupMemberId,
		},
		ListenerName:    conn.ListenerName,
		TransactionalId: conn.TransactionalId,
		ApiVersions:     apiVersions,
		ActiveRequests: &v1.ListConnectionsResponse_ActiveRequests{
			Requests:        currentRequests,
			HasMoreRequests: conn.InFlightRequests != nil && conn.InFlightRequests.HasMoreRequests,
		},
		RequestStatisticsAll: allRequests,
		RequestStatistics_1M: recentRequests,
	}
}

func buildFilterString(filters *v1.ListConnectionsRequest_Filters) string {
	if filters == nil {
		return ""
	}

	clauses := []string{}
	if filters.State != v1.KafkaConnectionState_KAFKA_CONNECTION_STATE_UNSPECIFIED {
		clauses = append(clauses, fmt.Sprintf("state = %s", filters.State.String()))
	}

	if filters.IdleMs > 0 {
		clauses = append(clauses, fmt.Sprintf("idle_duration > %dms", filters.IdleMs))
	}

	for key, val := range map[string]string{
		"source.ip_address":                  filters.IpAddress,
		"client_id":                          filters.ClientId,
		"client_software_name":               filters.ClientSoftwareName,
		"client_software_version":            filters.ClientSoftwareVersion,
		"group_id":                           filters.GroupId,
		"authentication_info.user_principal": filters.User,
	} {
		if val != "" {
			clauses = append(clauses, fmt.Sprintf("%s = %q", key, val))
		}
	}

	// Add the expression clause if present
	if filters.Expression != "" {
		clauses = append(clauses, filters.Expression)
	}

	return strings.Join(clauses, " AND ")
}

func buildOrderByString(req *v1.ListConnectionsRequest) string {
	// Default to most recently opened connections
	if len(req.OrderBy) == 0 && req.OrderByExpression == "" {
		return "open_time desc"
	}

	clauses := []string{}

	if req.OrderByExpression != "" {
		clauses = append(clauses, req.OrderByExpression)
	}

	for _, clause := range req.OrderBy {
		direction := "asc"
		if clause.Descending {
			direction = "desc"
		}

		val, ok := orderOptionMap[clause.Option]
		if !ok {
			continue
		}

		clauses = append(clauses, fmt.Sprintf("%s %s", val, direction))
	}

	return strings.Join(clauses, ", ")
}

// ListConnections returns active and recently closed connections across the cluster
func (s *Service) ListConnections(ctx context.Context, req *connect.Request[v1.ListConnectionsRequest]) (*connect.Response[v1.ListConnectionsResponse], error) {
	s.logger.InfoContext(ctx, "fetching recent connections")
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	adminClient, err := s.redpandaClientFactory.GetRedpandaAPIClient(ctx)
	if err != nil {
		return nil, err
	}

	limit := defaultLimit
	if req.Msg.Limit > 0 {
		limit = req.Msg.Limit
	}

	resp, err := adminClient.ClusterService().ListKafkaConnections(ctx, &connect.Request[adminv2.ListKafkaConnectionsRequest]{
		Msg: &adminv2.ListKafkaConnectionsRequest{
			Filter:   buildFilterString(req.Msg.Filters),
			OrderBy:  buildOrderByString(req.Msg),
			PageSize: int32(limit),
		},
	})
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "")
	}

	conns := make([]*v1.ListConnectionsResponse_Connection, len(resp.Msg.Connections))
	for i, conn := range resp.Msg.Connections {
		conns[i] = adminConnectionToConnect(conn)
	}

	return &connect.Response[v1.ListConnectionsResponse]{Msg: &v1.ListConnectionsResponse{Connections: conns}}, nil
}
