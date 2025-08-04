//go:build integration

// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"github.com/redpanda-data/console/backend/pkg/connect"
	"github.com/redpanda-data/console/backend/pkg/factory/redpanda"
	"github.com/redpanda-data/console/backend/pkg/factory/schema"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/config"
	kafkafactory "github.com/redpanda-data/console/backend/pkg/factory/kafka"
)

func (s *ConsoleIntegrationTestSuite) TestCreateQuotas() {
	t := s.T()
	ctx := context.Background()

	cfg := &config.Config{}
	cfg.SetDefaults()
	cfg.Kafka.Brokers = []string{s.testSeedBroker}
	logger := slog.Default()

	kafkaClientFactory := kafkafactory.NewCachedClientProvider(cfg, logger)

	var (
		nilSchemaClientFactory   schema.ClientFactory
		nilRedpandaClientFactory redpanda.ClientFactory
		nilCacheNamespaceFunc    func(context.Context) (string, error)
		nilConnectService        *connect.Service
	)

	consoleService, err := NewService(
		cfg,
		logger,
		kafkaClientFactory,
		nilSchemaClientFactory,
		nilRedpandaClientFactory,
		nilCacheNamespaceFunc,
		nilConnectService,
	)
	require.NoError(t, err)

	t.Run("create quota for specific client-id", func(t *testing.T) {
		clientID := "test-client-1"
		request := kmsg.AlterClientQuotasRequest{
			Entries: []kmsg.AlterClientQuotasRequestEntry{
				{
					Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
						{
							Type: "client-id",
							Name: &clientID,
						},
					},
					Ops: []kmsg.AlterClientQuotasRequestEntryOp{
						{
							Key:    "producer_byte_rate",
							Value:  1000000,
							Remove: false,
						},
						{
							Key:    "consumer_byte_rate",
							Value:  2000000,
							Remove: false,
						},
					},
				},
			},
		}

		err := consoleService.CreateQuotas(ctx, request)
		require.NoError(t, err)

		describeReq := kmsg.DescribeClientQuotasRequest{
			Components: []kmsg.DescribeClientQuotasRequestComponent{
				{
					EntityType: "client-id",
					MatchType:  0,
					Match:      &clientID,
				},
			},
		}

		resp := consoleService.DescribeQuotas(ctx, describeReq)
		require.Empty(t, resp.Error)
		require.NotEmpty(t, resp.Items)

		found := false
		for _, item := range resp.Items {
			if item.EntityType == "client-id" && item.EntityName == clientID {
				found = true
				assert.Len(t, item.Settings, 2)

				producerFound := false
				consumerFound := false
				for _, setting := range item.Settings {
					if setting.Key == "producer_byte_rate" {
						producerFound = true
						assert.Equal(t, 1000000.0, setting.Value)
					}
					if setting.Key == "consumer_byte_rate" {
						consumerFound = true
						assert.Equal(t, 2000000.0, setting.Value)
					}
				}
				assert.True(t, producerFound, "producer_byte_rate setting not found")
				assert.True(t, consumerFound, "consumer_byte_rate setting not found")
				break
			}
		}
		assert.True(t, found, "client quota not found in describe response")
	})

	// Nil value for client-id means default client-id
	t.Run("create quota for default client-id", func(t *testing.T) {
		request := kmsg.AlterClientQuotasRequest{
			Entries: []kmsg.AlterClientQuotasRequestEntry{
				{
					Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
						{
							Type: "client-id",
							Name: nil,
						},
					},
					Ops: []kmsg.AlterClientQuotasRequestEntryOp{
						{
							Key:    "producer_byte_rate",
							Value:  500000.0,
							Remove: false,
						},
					},
				},
			},
		}

		err := consoleService.CreateQuotas(ctx, request)
		require.NoError(t, err)

		describeReq := kmsg.DescribeClientQuotasRequest{
			Components: []kmsg.DescribeClientQuotasRequestComponent{
				{
					EntityType: "client-id",
					MatchType:  1,
					Match:      nil,
				},
			},
		}

		resp := consoleService.DescribeQuotas(ctx, describeReq)
		require.Empty(t, resp.Error)
		require.NotEmpty(t, resp.Items)

		found := false
		for _, item := range resp.Items {
			if item.EntityType == "client-id" && item.EntityName == "<default>" {
				found = true
				assert.Len(t, item.Settings, 1)
				assert.Equal(t, "producer_byte_rate", item.Settings[0].Key)
				assert.Equal(t, 500000.0, item.Settings[0].Value)
				break
			}
		}
		assert.True(t, found, "default client quota not found in describe response")
	})

	t.Run("create quota for client-id-prefix", func(t *testing.T) {
		prefix := "test-prefix"
		request := kmsg.AlterClientQuotasRequest{
			Entries: []kmsg.AlterClientQuotasRequestEntry{
				{
					Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
						{
							Type: "client-id-prefix",
							Name: &prefix,
						},
					},
					Ops: []kmsg.AlterClientQuotasRequestEntryOp{
						{
							Key:    "consumer_byte_rate",
							Value:  1500000.0,
							Remove: false,
						},
					},
				},
			},
		}

		err := consoleService.CreateQuotas(ctx, request)
		require.NoError(t, err)

		describeReq := kmsg.DescribeClientQuotasRequest{
			Components: []kmsg.DescribeClientQuotasRequestComponent{
				{
					EntityType: "client-id-prefix",
					MatchType:  0,
					Match:      &prefix,
				},
			},
		}

		resp := consoleService.DescribeQuotas(ctx, describeReq)
		require.Empty(t, resp.Error)
		require.NotEmpty(t, resp.Items)

		found := false
		for _, item := range resp.Items {
			if item.EntityType == "client-id-prefix" && item.EntityName == prefix {
				found = true
				assert.Len(t, item.Settings, 1)
				assert.Equal(t, "consumer_byte_rate", item.Settings[0].Key)
				assert.Equal(t, 1500000.0, item.Settings[0].Value)
				break
			}
		}
		assert.True(t, found, "prefix quota not found in describe response")
	})
}

func (s *ConsoleIntegrationTestSuite) TestDeleteQuotas() {
	t := s.T()
	ctx := context.Background()

	cfg := &config.Config{}
	cfg.SetDefaults()
	cfg.Kafka.Brokers = []string{s.testSeedBroker}
	logger := slog.Default()

	kafkaClientFactory := kafkafactory.NewCachedClientProvider(cfg, logger)

	var (
		nilSchemaClientFactory   schema.ClientFactory
		nilRedpandaClientFactory redpanda.ClientFactory
		nilCacheNamespaceFunc    func(context.Context) (string, error)
		nilConnectService        *connect.Service
	)

	consoleService, err := NewService(
		cfg,
		logger,
		kafkaClientFactory,
		nilSchemaClientFactory,
		nilRedpandaClientFactory,
		nilCacheNamespaceFunc,
		nilConnectService,
	)
	require.NoError(t, err)

	t.Run("delete specific quota values", func(t *testing.T) {
		clientID := "test-client-delete"

		createReq := kmsg.AlterClientQuotasRequest{
			Entries: []kmsg.AlterClientQuotasRequestEntry{
				{
					Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
						{
							Type: "client-id",
							Name: &clientID,
						},
					},
					Ops: []kmsg.AlterClientQuotasRequestEntryOp{
						{
							Key:    "producer_byte_rate",
							Value:  1000000.0,
							Remove: false,
						},
						{
							Key:    "consumer_byte_rate",
							Value:  2000000.0,
							Remove: false,
						},
					},
				},
			},
		}

		err := consoleService.CreateQuotas(ctx, createReq)
		require.NoError(t, err)

		deleteReq := kmsg.AlterClientQuotasRequest{
			Entries: []kmsg.AlterClientQuotasRequestEntry{
				{
					Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
						{
							Type: "client-id",
							Name: &clientID,
						},
					},
					Ops: []kmsg.AlterClientQuotasRequestEntryOp{
						{
							Key:    "producer_byte_rate",
							Remove: true,
						},
					},
				},
			},
		}

		err = consoleService.DeleteQuotas(ctx, deleteReq)
		require.NoError(t, err)

		describeReq := kmsg.DescribeClientQuotasRequest{
			Components: []kmsg.DescribeClientQuotasRequestComponent{
				{
					EntityType: "client-id",
					MatchType:  0,
					Match:      &clientID,
				},
			},
		}

		resp := consoleService.DescribeQuotas(ctx, describeReq)
		require.Empty(t, resp.Error)
		require.NotEmpty(t, resp.Items)

		found := false
		for _, item := range resp.Items {
			if item.EntityType == "client-id" && item.EntityName == clientID {
				found = true
				assert.Len(t, item.Settings, 1)
				assert.Equal(t, "consumer_byte_rate", item.Settings[0].Key)
				assert.Equal(t, 2000000.0, item.Settings[0].Value)
				break
			}
		}
		assert.True(t, found, "client quota not found after deletion")
	})

	t.Run("create and delete flow", func(t *testing.T) {
		clientID := "test-client-flow"

		createReq := kmsg.AlterClientQuotasRequest{
			Entries: []kmsg.AlterClientQuotasRequestEntry{
				{
					Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
						{
							Type: "client-id",
							Name: &clientID,
						},
					},
					Ops: []kmsg.AlterClientQuotasRequestEntryOp{
						{
							Key:    "producer_byte_rate",
							Value:  800000.0,
							Remove: false,
						},
					},
				},
			},
		}

		err := consoleService.CreateQuotas(ctx, createReq)
		require.NoError(t, err)

		deleteReq := kmsg.AlterClientQuotasRequest{
			Entries: []kmsg.AlterClientQuotasRequestEntry{
				{
					Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
						{
							Type: "client-id",
							Name: &clientID,
						},
					},
					Ops: []kmsg.AlterClientQuotasRequestEntryOp{
						{
							Key:    "producer_byte_rate",
							Remove: true,
						},
					},
				},
			},
		}

		err = consoleService.DeleteQuotas(ctx, deleteReq)
		require.NoError(t, err)

		describeReq := kmsg.DescribeClientQuotasRequest{
			Components: []kmsg.DescribeClientQuotasRequestComponent{
				{
					EntityType: "client-id",
					MatchType:  0,
					Match:      &clientID,
				},
			},
		}

		resp := consoleService.DescribeQuotas(ctx, describeReq)
		require.Empty(t, resp.Error)

		for _, item := range resp.Items {
			if item.EntityType == "client-id" && item.EntityName == clientID {
				assert.Empty(t, item.Settings, "quota settings should be empty after deletion")
			}
		}
	})
}
