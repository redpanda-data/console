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
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	v1alpha1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
)

func (s *APISuite) TestClusterStatus() {
	t := s.T()

	client := v1alpha1connect.NewClusterStatusServiceClient(http.DefaultClient, s.httpAddress())

	t.Run("get cluster status for Kafka API (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 6*time.Second)
		defer cancel()

		kafkaInfo, err := client.GetKafkaInfo(ctx, connect.NewRequest(&v1alpha1.GetKafkaInfoRequest{}))
		require.NoError(t, err)
		assert.Equal(t, v1alpha1.StatusType_STATUS_TYPE_HEALTHY, kafkaInfo.Msg.GetStatus().Status)
		assert.Equal(t, 1, len(kafkaInfo.Msg.GetBrokers()))
		assert.Equal(t, v1alpha1.KafkaDistribution_KAFKA_DISTRIBUTION_REDPANDA, kafkaInfo.Msg.GetDistribution())
	})

	t.Run("get cluster status for Kafka API authorizer (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 6*time.Second)
		defer cancel()

		authorizerInfo, err := client.GetKafkaAuthorizerInfo(ctx, connect.NewRequest(&v1alpha1.GetKafkaAuthorizerInfoRequest{}))
		require.NoError(t, err)
		assert.GreaterOrEqual(t, int32(0), authorizerInfo.Msg.AclCount)
	})

	t.Run("get cluster status for Redpanda admin api (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 6*time.Second)
		defer cancel()

		redpandaInfo, err := client.GetRedpandaInfo(ctx, connect.NewRequest(&v1alpha1.GetRedpandaInfoRequest{}))
		require.NoError(t, err)
		assert.GreaterOrEqual(t, int32(0), redpandaInfo.Msg.GetUserCount())
	})

	t.Run("get cluster status for partition balancer status api (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 6*time.Second)
		defer cancel()

		pbs, err := client.GetRedpandaPartitionBalancerStatus(ctx, connect.NewRequest(&v1alpha1.GetRedpandaPartitionBalancerStatusRequest{}))
		require.NoError(t, err)

		// At startup the PBS may be in progress and not ready.
		statuses := []string{
			v1alpha1.GetRedpandaPartitionBalancerStatusResponse_STATUS_READY.String(),
			v1alpha1.GetRedpandaPartitionBalancerStatusResponse_STATUS_IN_PROGRESS.String(),
		}
		assert.Contains(t, statuses, pbs.Msg.GetStatus().String())
	})

	t.Run("get cluster status for Kafka Connect api (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 6*time.Second)
		defer cancel()

		kcInfo, err := client.GetKafkaConnectInfo(ctx, connect.NewRequest(&v1alpha1.GetKafkaConnectInfoRequest{}))
		require.NoError(t, err)
		require.GreaterOrEqual(t, 1, len(kcInfo.Msg.Clusters))
		assert.Equal(t, v1alpha1.StatusType_STATUS_TYPE_HEALTHY, kcInfo.Msg.GetClusters()[0].Status.Status)
	})

	t.Run("get cluster status for schema registry api (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 6*time.Second)
		defer cancel()

		schemaInfo, err := client.GetSchemaRegistryInfo(ctx, connect.NewRequest(&v1alpha1.GetSchemaRegistryInfoRequest{}))
		require.NoError(t, err)
		assert.Equal(t, v1alpha1.StatusType_STATUS_TYPE_HEALTHY.String(), schemaInfo.Msg.GetStatus().GetStatus().String())
	})
}
