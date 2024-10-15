// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package api

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	con "github.com/cloudhut/connect-client"
	"github.com/docker/go-connections/nat"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go/modules/redpanda"
	"github.com/testcontainers/testcontainers-go/network"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/connect"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

func (s *APIIntegrationTestSuite) TestHandleCreateConnector() {
	t := s.T()

	require := require.New(t)
	assert := assert.New(t)

	// setup
	ctx := context.Background()

	// create one common network that all containers will share
	testNetwork, err := network.New(ctx, network.WithAttachable())
	require.NoError(err)
	t.Cleanup(func() {
		assert.NoError(testNetwork.Remove(ctx))
	})

	redpandaContainer, err := redpanda.Run(ctx,
		"redpandadata/redpanda:v23.3.18",
		network.WithNetwork([]string{"redpanda"}, testNetwork),
		redpanda.WithListener("redpanda:29092"),
	)
	require.NoError(err)

	seedBroker, err := redpandaContainer.KafkaSeedBroker(ctx)
	require.NoError(err)

	// Kafka Connect container
	connectC, err := testutil.RunRedpandaConnectorsContainer(
		ctx,
		[]string{"redpanda:29092"},
		network.WithNetwork([]string{"kafka-connect"}, testNetwork),
	)
	require.NoError(err)

	connectContainer := connectC

	connectPort, err := connectContainer.MappedPort(ctx, nat.Port("8083"))
	require.NoError(err)

	connectHost, err := connectContainer.Host(ctx)
	require.NoError(err)

	// new connect service
	log, err := zap.NewProduction()
	require.NoError(err)

	connectCfg := config.Connect{}
	connectCfg.SetDefaults()
	connectCfg.Enabled = true
	connectCfg.Clusters = []config.ConnectCluster{
		{
			Name: "redpanda_connect",
			URL:  "http://" + connectHost + ":" + connectPort.Port(),
		},
	}

	newConnectSvc, err := connect.NewService(connectCfg, log)
	assert.NoError(err)

	// save old
	oldConnectSvc := s.api.ConnectSvc

	// switch
	s.api.ConnectSvc = newConnectSvc

	// reset connect service
	defer func() {
		s.api.ConnectSvc = oldConnectSvc
	}()

	t.Cleanup(func() {
		assert.NoError(connectContainer.Terminate(context.Background()))
		assert.NoError(redpandaContainer.Terminate(context.Background()))
	})

	t.Run("happy path", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		input := &createConnectorRequest{
			ConnectorName: "mm2-connector",
			Config: map[string]any{
				"connector.class":                  "org.apache.kafka.connect.mirror.MirrorSourceConnector",
				"name":                             "mm2-connector",
				"topics":                           "input-topic",
				"replication.factor":               "1",
				"source.cluster.alias":             "source",
				"source.cluster.bootstrap.servers": seedBroker,
			},
		}

		res, body := s.apiRequest(ctx, http.MethodPost, "/api/kafka-connect/clusters/redpanda_connect/connectors", input)

		require.Equal(200, res.StatusCode)

		createConnectRes := con.ConnectorInfo{}
		err := json.Unmarshal(body, &createConnectRes)
		require.NoError(err)

		assert.Equal("mm2-connector", createConnectRes.Name)
		assert.Equal("input-topic", createConnectRes.Config["topics"])
	})
}
