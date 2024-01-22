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

func (s *APISuite) TestListConnectors() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	t.Run("list Connectors with invalid Request (connect-go)", func(t *testing.T) {
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

func (s *APISuite) TestListConnectClusters() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	t.Run("list connect clusters request (connect-go)", func(t *testing.T) {
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

func (s *APISuite) TestGetConnectorAndStatus() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Minute)
	defer cancel()

	// Run HTTPBin container
	httpC, err := testutil.RunHTTPBinContainer(ctx, network.WithNetwork([]string{"httpbin", "local-httpbin"}, s.network))
	require.NoError(err)

	client := v1alpha1connect.NewKafkaConnectServiceClient(http.DefaultClient, s.httpAddress())

	// Create Connector request
	input := &v1alpha1.CreateConnectorRequest{
		ClusterName: "connect-cluster",
		Connector: &v1alpha1.ConnectorSpec{
			Name: "http_connect_input",
			Config: map[string]string{
				"connector.class":                           "com.github.castorm.kafka.connect.http.HttpSourceConnector",
				"header.converter":                          "org.apache.kafka.connect.storage.SimpleHeaderConverter",
				"http.request.url":                          "http://httpbin/uuid",
				"http.timer.catchup.interval.millis":        "10000",
				"http.timer.interval.millis":                "1000",
				"kafka.topic":                               "httpbin-input",
				"key.converter":                             "org.apache.kafka.connect.json.JsonConverter",
				"key.converter.schemas.enable":              "false",
				"name":                                      "http_connect_input",
				"topic.creation.default.partitions":         "1",
				"topic.creation.default.replication.factor": "1",
				"topic.creation.enable":                     "true",
				"value.converter":                           "org.apache.kafka.connect.json.JsonConverter",
				"value.converter.schemas.enable":            "false",
			},
		},
	}

	_, err = client.CreateConnector(ctx, connect.NewRequest(input))

	require.NoError(err)

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
		require.NoError(err)

		// Stop HTTPBin container
		err = httpC.Terminate(ctx)
		require.NoError(err)
	})

	t.Run("Get connector request (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		res, err := client.GetConnector(ctx, connect.NewRequest(
			&v1alpha1.GetConnectorRequest{
				ClusterName: input.ClusterName,
				Name:        input.Connector.Name,
			}))
		require.NoError(err)
		assert.NotNil(res.Msg, "response message must not be nil")
		assert.Equal("http_connect_input", res.Msg.Connector.Name)
		assert.Equal(input.Connector.Config, res.Msg.Connector.Config)
	})

	t.Run("Get connector request (http)", func(t *testing.T) {
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
			Path("connect/clusters/connect-cluster/connectors/http_connect_input").
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
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		res, err := client.GetConnectorStatus(ctx, connect.NewRequest(
			&v1alpha1.GetConnectorStatusRequest{
				ClusterName: input.ClusterName,
				Name:        input.Connector.Name,
			}))
		require.NoError(err)
		assert.NotNil(res.Msg, "response message must not be nil")
		assert.Equal("http_connect_input", res.Msg.Status.Name)
	})

	t.Run("Get connector status request (http)", func(t *testing.T) {
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
			Path("connect/clusters/connect-cluster/connectors/http_connect_input/status").
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
