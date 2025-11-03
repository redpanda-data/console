// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package monitoring

import (
	"strings"
	"testing"
	"time"

	adminv2 "buf.build/gen/go/redpandadata/core/protocolbuffers/go/redpanda/core/admin/v2"
	"buf.build/go/protovalidate"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/durationpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

func TestAdminConnectionToConnect(t *testing.T) {
	t.Run("empty connection", func(t *testing.T) {
		// Effectively make sure we don't panic when we see nils
		out := adminConnectionToConnect(&adminv2.KafkaConnection{})
		require.NotNil(t, out)
	})

	t.Run("normal connection", func(t *testing.T) {
		protoConn := &adminv2.KafkaConnection{
			NodeId:   2,
			ShardId:  4,
			Uid:      "36338ca5-86b7-4478-ad23-32d49cfaef61",
			State:    adminv2.KafkaConnectionState_KAFKA_CONNECTION_STATE_OPEN,
			OpenTime: timestamppb.New(time.Date(2025, 10, 23, 1, 2, 3, 0, time.UTC)),

			// we normally wouldn't have a CloseTime w/ STATE_OPEN, but we want to check a known duration
			CloseTime: timestamppb.New(time.Date(2025, 10, 23, 1, 2, 5, 0, time.UTC)),
			AuthenticationInfo: &adminv2.AuthenticationInfo{
				State:         adminv2.AuthenticationState_AUTHENTICATION_STATE_SUCCESS,
				Mechanism:     adminv2.AuthenticationMechanism_AUTHENTICATION_MECHANISM_MTLS,
				UserPrincipal: "someone",
			},
			TlsInfo: &adminv2.TLSInfo{
				Enabled: true,
			},
			ListenerName: "external",
			Source: &adminv2.Source{
				IpAddress: "4.2.2.1",
				Port:      12345,
			},
			ClientId:              "a-unique-client-id",
			ClientSoftwareName:    "some-library",
			ClientSoftwareVersion: "v0.0.1",
			GroupId:               "group-a",
			GroupInstanceId:       "group-instance",
			GroupMemberId:         "group-member",
			ApiVersions:           map[int32]int32{0: 4},
			IdleDuration:          durationpb.New(100 * time.Millisecond),
			TransactionalId:       "trans-id",
			InFlightRequests: &adminv2.InFlightRequests{
				SampledInFlightRequests: []*adminv2.InFlightRequests_Request{
					{
						ApiKey:           0, // PRODUCE
						InFlightDuration: durationpb.New(40 * time.Millisecond),
					},
				},
				HasMoreRequests: true,
			},
			TotalRequestStatistics: &adminv2.RequestStatistics{
				ProduceBytes:      10000,
				FetchBytes:        2000,
				RequestCount:      200,
				ProduceBatchCount: 10,
			},
			RecentRequestStatistics: &adminv2.RequestStatistics{
				ProduceBytes:      1000,
				FetchBytes:        200,
				RequestCount:      20,
				ProduceBatchCount: 1,
			},
		}

		out := adminConnectionToConnect(protoConn)
		require.Equal(t, &v1.ListConnectionsResponse_Connection{
			NodeId:             2,
			ShardId:            4,
			Uid:                "36338ca5-86b7-4478-ad23-32d49cfaef61",
			State:              adminv2.KafkaConnectionState_KAFKA_CONNECTION_STATE_OPEN,
			OpenTime:           timestamppb.New(time.Date(2025, 10, 23, 1, 2, 3, 0, time.UTC)),
			CloseTime:          timestamppb.New(time.Date(2025, 10, 23, 1, 2, 5, 0, time.UTC)),
			ConnectionDuration: durationpb.New(2 * time.Second),
			Authentication: &adminv2.AuthenticationInfo{
				State:         adminv2.AuthenticationState_AUTHENTICATION_STATE_SUCCESS,
				Mechanism:     adminv2.AuthenticationMechanism_AUTHENTICATION_MECHANISM_MTLS,
				UserPrincipal: "someone",
			},
			TlsEnabled:   true,
			ListenerName: "external",
			Client: &v1.ListConnectionsResponse_ConnectionClient{
				Ip:              "4.2.2.1",
				Port:            12345,
				Id:              "a-unique-client-id",
				SoftwareName:    "some-library",
				SoftwareVersion: "v0.0.1",
			},
			Group: &v1.ListConnectionsResponse_GroupInfo{
				Id:         "group-a",
				InstanceId: "group-instance",
				MemberId:   "group-member",
			},
			ApiVersions: []*v1.ListConnectionsResponse_APIVersion{
				{Api: v1.KafkaAPI_KAFKA_API_PRODUCE, Version: 4},
			},
			IdleDuration:    durationpb.New(100 * time.Millisecond),
			TransactionalId: "trans-id",
			ActiveRequests: &v1.ListConnectionsResponse_ActiveRequests{Requests: []*v1.ListConnectionsResponse_ActiveRequests_Request{
				{Api: v1.KafkaAPI_KAFKA_API_PRODUCE, Duration: durationpb.New(40 * time.Millisecond)},
			}, HasMoreRequests: true},
			RequestStatisticsAll: &adminv2.RequestStatistics{
				ProduceBytes:      10000,
				FetchBytes:        2000,
				RequestCount:      200,
				ProduceBatchCount: 10,
			},
			RequestStatistics_1M: &adminv2.RequestStatistics{
				ProduceBytes:      1000,
				FetchBytes:        200,
				RequestCount:      20,
				ProduceBatchCount: 1,
			},
		}, out)
	})
}

// Make sure we correctly validate the incoming request (actually handled in middleware)
func TestValidateListConnectionsRequest(t *testing.T) {
	// IdleMs must be positive
	require.Error(t, protovalidate.GlobalValidator.Validate(&v1.ListConnectionsRequest{IdleMs: -1}))

	// We can't have any of the common filters alongside filter_raw
	require.Error(t, protovalidate.GlobalValidator.Validate(&v1.ListConnectionsRequest{
		IpAddress: "127.0.0.1",
		FilterRaw: "client.ip = '127.0.0.2'",
	}))

	// But combining other filters is fine
	require.NoError(t, protovalidate.GlobalValidator.Validate(&v1.ListConnectionsRequest{
		IpAddress: "127.0.0.1",
		ClientId:  "some-client",
		User:      "whoever",
	}))
}

// Make sure we're adequately constructing the right filters
func TestBuildFilter(t *testing.T) {
	req := &v1.ListConnectionsRequest{
		IpAddress:             "127.0.0.1",
		ClientId:              "client-id",
		ClientSoftwareName:    "software-name",
		ClientSoftwareVersion: "v0.0.1",
		GroupId:               "group-id",
		User:                  "principal",
		IdleMs:                100,
		State:                 adminv2.KafkaConnectionState_KAFKA_CONNECTION_STATE_OPEN,
	}

	require.ElementsMatch(t, []string{
		`source.ip_address = "127.0.0.1"`,
		`client_id = "client-id"`,
		`client_software_name = "software-name"`,
		`client_software_version = "v0.0.1"`,
		`group_id = "group-id"`,
		`authentication_info.user_principal = "principal"`,
		`idle_duration > 100ms`,
		`state = KAFKA_CONNECTION_STATE_OPEN`,
	}, strings.Split(buildFilter(req), " AND "))
}
