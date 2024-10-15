// Copyright 2023 Redpanda Data, Inc.
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
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/carlmjohnson/requests"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go/network"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	v1alpha1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

func (s *APISuite) TestListConnectors_V1Alpha1() {
	t := s.T()

	t.Run("list Connectors with invalid Request (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		client := v1alpha1connect.NewKafkaConnectServiceClient(http.DefaultClient, s.httpAddress())
		_, err := client.ListConnectors(ctx, connect.NewRequest(
			&v1alpha1.ListConnectorsRequest{
				ClusterName: "foo",
			}))
		assert.Error(err)
		assert.Equal(connect.CodeNotFound, connect.CodeOf(err))
	})

	t.Run("list connectors with default request (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		client := v1alpha1connect.NewKafkaConnectServiceClient(http.DefaultClient, s.httpAddress())
		res, err := client.ListConnectors(ctx, connect.NewRequest(
			&v1alpha1.ListConnectorsRequest{
				ClusterName: "connect-cluster",
			}))
		require.NoError(err)
		assert.NotNil(res.Msg, "response message must not be nil")
		assert.IsType([]*v1alpha1.ListConnectorsResponse_ConnectorInfoStatus{}, res.Msg.Connectors)
	})
}

func (s *APISuite) TestListConnectClusters_V1Alpha1() {
	t := s.T()

	t.Run("list connect clusters request (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		client := v1alpha1connect.NewKafkaConnectServiceClient(http.DefaultClient, s.httpAddress())
		res, err := client.ListConnectClusters(ctx, connect.NewRequest(
			&v1alpha1.ListConnectClustersRequest{}))
		assert.NoError(err)
		assert.NotNil(res.Msg, "response message must not be nil")
		assert.Equal(1, len(res.Msg.Clusters), "there should be one cluster")
		assert.Equal("connect-cluster", res.Msg.Clusters[0].Name)
	})

	t.Run("list connect clusters request (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		type listConnectClustersResponse struct {
			Clusters []struct {
				Name    string `json:"name"`
				Address string `json:"address"`
				Info    struct {
					Version        string `json:"version"`
					Commit         string `json:"commit"`
					KafkaClusterId string `json:"kafka_cluster_id"`
				} `json:"info"`
				Plugins []struct {
					Type    string ` json:"type"`
					Version string `json:"version"`
					Class   string `json:"class"`
				} `json:"plugins"`
			} `json:"clusters"`
		}
		var response listConnectClustersResponse
		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1alpha1/").
			Path("connect/clusters").
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			ToJSON(&response).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)
		assert.Equal(len(response.Clusters), 1)
		assert.Equal("connect-cluster", response.Clusters[0].Name)
	})
}

func (s *APISuite) TestGetConnectorAndStatus_V1Alpha1() {
	t := s.T()
	requireT := require.New(t)

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Minute)
	defer cancel()

	// Run HTTPBin container
	httpC, err := testutil.RunHTTPBinContainer(ctx, network.WithNetwork([]string{"httpbin", "local-httpbin"}, s.network))
	requireT.NoError(err)

	client := v1alpha1connect.NewKafkaConnectServiceClient(http.DefaultClient, s.httpAddress())

	// Create Connector request
	input := &v1alpha1.CreateConnectorRequest{
		ClusterName: "connect-cluster",
		Connector: &v1alpha1.ConnectorSpec{
			Name: "mm2_connect_input_v1alpha1",
			Config: map[string]string{
				"connector.class":                    "org.apache.kafka.connect.mirror.MirrorSourceConnector",
				"header.converter":                   "org.apache.kafka.connect.converters.ByteArrayConverter",
				"name":                               "mm2_connect_input_v1alpha1",
				"topics":                             "input-topic",
				"replication.factor":                 "1",
				"source.cluster.alias":               "source",
				"source.cluster.bootstrap.servers":   s.testSeedBroker,
				"source.cluster.ssl.keystore.type":   "PEM",
				"source.cluster.ssl.truststore.type": "PEM",
			},
		},
	}

	_, err = client.CreateConnector(ctx, connect.NewRequest(input))

	requireT.NoError(err)

	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()

		// delete connector
		_, err := client.DeleteConnector(ctx, connect.NewRequest(
			&v1alpha1.DeleteConnectorRequest{
				ClusterName: input.ClusterName,
				Name:        input.Connector.Name,
			},
		))
		requireT.NoError(err)

		// Stop HTTPBin container
		err = httpC.Terminate(ctx)
		requireT.NoError(err)
	})

	t.Run("Get connector request (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		res, err := client.GetConnector(ctx, connect.NewRequest(
			&v1alpha1.GetConnectorRequest{
				ClusterName: input.ClusterName,
				Name:        input.Connector.Name,
			}))
		require.NoError(err)
		assert.NotNil(res.Msg, "response message must not be nil")
		assert.Equal("mm2_connect_input_v1alpha1", res.Msg.Connector.Name)
		assert.Equal(input.Connector.Config, res.Msg.Connector.Config)
	})

	t.Run("Get connector request (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		type getConnectorResponse struct {
			Name   string            `json:"name"`
			Config map[string]string `json:"config"`
			Type   string            `json:"type"`
		}

		var response getConnectorResponse
		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1alpha1/").
			Path("connect/clusters/connect-cluster/connectors/mm2_connect_input_v1alpha1").
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			ToJSON(&response).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)
		assert.Equal(input.Connector.Name, response.Name)
		assert.Equal(input.Connector.Config, response.Config)
		assert.Equal("source", response.Type)
	})

	t.Run("Get connector status (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		res, err := client.GetConnectorStatus(ctx, connect.NewRequest(
			&v1alpha1.GetConnectorStatusRequest{
				ClusterName: input.ClusterName,
				Name:        input.Connector.Name,
			}))
		require.NoError(err)
		assert.NotNil(res.Msg, "response message must not be nil")
		assert.Equal("mm2_connect_input_v1alpha1", res.Msg.Status.Name)
	})

	t.Run("Get connector status request (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		type getConnectorStatusResponse struct {
			Name string `json:"name"`
			Type string `json:"type"`
		}

		var response getConnectorStatusResponse
		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1alpha1/").
			Path("connect/clusters/connect-cluster/connectors/mm2_connect_input_v1alpha1/status").
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			ToJSON(&response).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)
		assert.Equal(input.Connector.Name, response.Name)
		assert.Equal("source", response.Type)
	})
}
