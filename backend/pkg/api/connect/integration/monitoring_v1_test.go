// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package integration

import (
	"context"
	"net/http"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"

	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	v1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
)

func (s *APISuite) TestListConnections_v1() {
	t := s.T()

	// TODO: enable after ListKafkaConnections is available in the main redpanda image
	t.Skip()

	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	t.Cleanup(cancel)

	// Create a Kafka client connection to ensure there's at least one connection
	client, err := kgo.NewClient(
		kgo.SeedBrokers(s.testSeedBroker),
		kgo.ClientID("test-list-connections-client"),
	)
	require.NoError(t, err)
	defer client.Close()

	// Ping to establish connection
	require.NoError(t, client.Ping(ctx))

	// List connections
	res, err := v1connect.NewMonitoringServiceClient(http.DefaultClient, s.httpAddress()).
		ListConnections(ctx, connect.NewRequest(&v1.ListConnectionsRequest{}))

	require.NoError(t, err)
	require.Greater(t, len(res.Msg.Connections), 0, "expected at least one connection")
}
