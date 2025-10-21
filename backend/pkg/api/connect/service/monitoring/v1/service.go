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

func adminConnectionToConnect(conn *adminv2.KafkaConnection) *v1.Connection {
	// Convert the current requests into our format
	currentRequests := make([]*v1.ActiveRequests_Request, len(conn.InFlightRequests.SampledInFlightRequests))
	for i, req := range conn.InFlightRequests.SampledInFlightRequests {
		currentRequests[i] = &v1.ActiveRequests_Request{
			Api:      kafkaAPIFromKey(req.ApiKey),
			Duration: req.InFlightDuration,
		}
	}

	apiVersions := []*v1.APIVersion{}
	for key, ver := range conn.ApiVersions {
		apiVersions = append(apiVersions, &v1.APIVersion{
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

	return &v1.Connection{
		NodeId:             conn.NodeId,
		ShardId:            conn.ShardId,
		Uid:                conn.Uid,
		State:              conn.State,
		Authentication:     conn.AuthenticationInfo,
		OpenTime:           conn.OpenTime,
		CloseTime:          conn.CloseTime,
		ConnectionDuration: durationpb.New(duration),
		IdleDuration:       conn.IdleDuration,
		TlsEnabled:         conn.TlsInfo.Enabled,
		Client: &v1.ConnectionClient{
			Ip:              conn.Source.IpAddress,
			Port:            conn.Source.Port,
			Id:              conn.ClientId,
			SoftwareName:    conn.ClientSoftwareName,
			SoftwareVersion: conn.ClientSoftwareVersion,
		},
		Group: &v1.GroupInfo{
			Id:         conn.GroupId,
			InstanceId: conn.GroupInstanceId,
			MemberId:   conn.GroupMemberId,
		},
		ListenerName:    conn.ListenerName,
		TransactionalId: conn.TransactionalId,
		ApiVersions:     apiVersions,
		ActiveRequests: &v1.ActiveRequests{
			Requests:        currentRequests,
			HasMoreRequests: conn.InFlightRequests.HasMoreRequests,
		},
		RequestStatisticsAll: conn.TotalRequestStatistics,
		RequestStatistics_1M: conn.RecentRequestStatistics,
	}
}

func buildFilterClauses(req *v1.ListConnectionsRequest) []string {
	clauses := []string{}
	if req.State != adminv2.KafkaConnectionState_KAFKA_CONNECTION_STATE_UNSPECIFIED {
		clauses = append(clauses, fmt.Sprintf("state = %s", req.State.String()))
	}

	if req.IdleMs > 0 {
		clauses = append(clauses, fmt.Sprintf("idle_duration > %dms", req.IdleMs))
	}

	for key, val := range map[string]string{
		"source.ip_address":                  req.IpAddress,
		"client_id":                          req.ClientId,
		"client_software_name":               req.ClientSoftwareName,
		"client_software_version":            req.ClientSoftwareVersion,
		"group_id":                           req.GroupId,
		"authentication_info.user_principal": req.User,
	} {
		if val != "" {
			clauses = append(clauses, fmt.Sprintf("%s = %q", key, val))
		}
	}

	return clauses
}

// ListConnections returns active and recently closed connections across the cluster
func (s *Service) ListConnections(ctx context.Context, req *connect.Request[v1.ListConnectionsRequest]) (*connect.Response[v1.ListConnectionsResponse], error) {
	s.logger.InfoContext(ctx, "fetching recent connections")
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	adminClient, err := s.redpandaClientFactory.GetRedpandaAPIClient(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("failed to get admin API client: %w", err),
			apierrors.NewErrorInfo("REASON_REDPANDA_ADMIN_API_ERROR"),
		)
	}

	limit := defaultLimit
	if req.Msg.Limit > 0 {
		limit = req.Msg.Limit
	}

	resp, err := adminClient.ClusterService().ListKafkaConnections(ctx, &connect.Request[adminv2.ListKafkaConnectionsRequest]{
		Msg: &adminv2.ListKafkaConnectionsRequest{
			Filter:   strings.Join(buildFilterClauses(req.Msg), " AND "),
			OrderBy:  req.Msg.OrderBy,
			PageSize: int32(limit),
		},
	})
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("failed to fetch connections: %w", err),
			apierrors.NewErrorInfo("REASON_REDPANDA_ADMIN_API_ERROR"),
		)
	}

	conns := make([]*v1.Connection, len(resp.Msg.Connections))
	for i, conn := range resp.Msg.Connections {
		conns[i] = adminConnectionToConnect(conn)
	}

	return &connect.Response[v1.ListConnectionsResponse]{Msg: &v1.ListConnectionsResponse{Connections: conns}}, nil
}
