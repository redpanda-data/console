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

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	v1alpha1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
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
		assert.Equal(0, len(res.Msg.Connectors))
	})
}

func (s *APISuite) TestListConnectClusters() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	t.Run("list connect clusters default request (connect-go)", func(t *testing.T) {
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

	t.Run("list connect clusters with default request (http)", func(t *testing.T) {
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
