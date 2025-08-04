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
	"log/slog"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/connect"
	"github.com/redpanda-data/console/backend/pkg/factory/kafka"
	"github.com/redpanda-data/console/backend/pkg/factory/redpanda"
	"github.com/redpanda-data/console/backend/pkg/factory/schema"
)

const (
	// Entity types
	entityTypeClientID       = "client-id"
	entityTypeClientIDPrefix = "client-id-prefix"

	// Quota keys
	producerByteRateKey = "producer_byte_rate"
	consumerByteRateKey = "consumer_byte_rate"

	// Default entity name
	defaultEntityName = "<default>"

	// Test client IDs
	testClient1      = "test-client-1"
	testClientDelete = "test-client-delete"
	testClientFlow   = "test-client-flow"
	testPrefix       = "test-prefix"

	// Quota values (bytes per second)
	producerRate1MB   = 1000000.0 // 1MB/s
	consumerRate2MB   = 2000000.0 // 2MB/s
	producerRate500KB = 500000.0  // 500KB/s
	consumerRate1_5MB = 1500000.0 // 1.5MB/s
	producerRate800KB = 800000.0  // 800KB/s

	// Match types for describe requests
	matchTypeSpecific = 0 // Match specific entity
	matchTypeDefault  = 1 // Match default entity
)

func (s *ConsoleIntegrationTestSuite) TestCreateQuotas() {
	t := s.T()
	ctx := context.Background()

	cfg := &config.Config{}
	cfg.SetDefaults()
	cfg.Kafka.Brokers = []string{s.testSeedBroker}
	logger := slog.Default()

	kafkaClientFactory := kafka.NewCachedClientProvider(cfg, logger)

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
		clientID := testClient1
		request := kmsg.AlterClientQuotasRequest{
			Entries: []kmsg.AlterClientQuotasRequestEntry{
				{
					Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
						{
							Type: entityTypeClientID,
							Name: &clientID,
						},
					},
					Ops: []kmsg.AlterClientQuotasRequestEntryOp{
						{
							Key:    producerByteRateKey,
							Value:  producerRate1MB,
							Remove: false,
						},
						{
							Key:    consumerByteRateKey,
							Value:  consumerRate2MB,
							Remove: false,
						},
					},
				},
			},
		}

		err := consoleService.AlterQuotas(ctx, request)
		require.NoError(t, err)

		describeReq := kmsg.DescribeClientQuotasRequest{
			Components: []kmsg.DescribeClientQuotasRequestComponent{
				{
					EntityType: entityTypeClientID,
					MatchType:  matchTypeSpecific,
					Match:      &clientID,
				},
			},
		}

		resp := consoleService.DescribeQuotas(ctx, describeReq)
		require.Empty(t, resp.Error)
		require.NotEmpty(t, resp.Items)

		found := false
		for _, item := range resp.Items {
			if item.EntityType == entityTypeClientID && item.EntityName == clientID {
				found = true
				assert.Len(t, item.Settings, 2)

				producerFound := false
				consumerFound := false
				for _, setting := range item.Settings {
					if setting.Key == producerByteRateKey {
						producerFound = true
						assert.Equal(t, producerRate1MB, setting.Value)
					}
					if setting.Key == consumerByteRateKey {
						consumerFound = true
						assert.Equal(t, consumerRate2MB, setting.Value)
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
							Type: entityTypeClientID,
							Name: nil,
						},
					},
					Ops: []kmsg.AlterClientQuotasRequestEntryOp{
						{
							Key:    producerByteRateKey,
							Value:  producerRate500KB,
							Remove: false,
						},
					},
				},
			},
		}

		err := consoleService.AlterQuotas(ctx, request)
		require.NoError(t, err)

		describeReq := kmsg.DescribeClientQuotasRequest{
			Components: []kmsg.DescribeClientQuotasRequestComponent{
				{
					EntityType: entityTypeClientID,
					MatchType:  matchTypeDefault,
					Match:      nil,
				},
			},
		}

		resp := consoleService.DescribeQuotas(ctx, describeReq)
		require.Empty(t, resp.Error)
		require.NotEmpty(t, resp.Items)

		found := false
		for _, item := range resp.Items {
			if item.EntityType == entityTypeClientID && item.EntityName == defaultEntityName {
				found = true
				assert.Len(t, item.Settings, 1)
				assert.Equal(t, producerByteRateKey, item.Settings[0].Key)
				assert.Equal(t, producerRate500KB, item.Settings[0].Value)
				break
			}
		}
		assert.True(t, found, "default client quota not found in describe response")
	})

	t.Run("create quota for client-id-prefix", func(t *testing.T) {
		prefix := testPrefix
		request := kmsg.AlterClientQuotasRequest{
			Entries: []kmsg.AlterClientQuotasRequestEntry{
				{
					Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
						{
							Type: entityTypeClientIDPrefix,
							Name: &prefix,
						},
					},
					Ops: []kmsg.AlterClientQuotasRequestEntryOp{
						{
							Key:    consumerByteRateKey,
							Value:  consumerRate1_5MB,
							Remove: false,
						},
					},
				},
			},
		}

		err := consoleService.AlterQuotas(ctx, request)
		require.NoError(t, err)

		describeReq := kmsg.DescribeClientQuotasRequest{
			Components: []kmsg.DescribeClientQuotasRequestComponent{
				{
					EntityType: entityTypeClientIDPrefix,
					MatchType:  matchTypeSpecific,
					Match:      &prefix,
				},
			},
		}

		resp := consoleService.DescribeQuotas(ctx, describeReq)
		require.Empty(t, resp.Error)
		require.NotEmpty(t, resp.Items)

		found := false
		for _, item := range resp.Items {
			if item.EntityType == entityTypeClientIDPrefix && item.EntityName == prefix {
				found = true
				assert.Len(t, item.Settings, 1)
				assert.Equal(t, consumerByteRateKey, item.Settings[0].Key)
				assert.Equal(t, consumerRate1_5MB, item.Settings[0].Value)
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

	kafkaClientFactory := kafka.NewCachedClientProvider(cfg, logger)

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
		clientID := testClientDelete

		createReq := kmsg.AlterClientQuotasRequest{
			Entries: []kmsg.AlterClientQuotasRequestEntry{
				{
					Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
						{
							Type: entityTypeClientID,
							Name: &clientID,
						},
					},
					Ops: []kmsg.AlterClientQuotasRequestEntryOp{
						{
							Key:    producerByteRateKey,
							Value:  producerRate1MB,
							Remove: false,
						},
						{
							Key:    consumerByteRateKey,
							Value:  consumerRate2MB,
							Remove: false,
						},
					},
				},
			},
		}

		err := consoleService.AlterQuotas(ctx, createReq)
		require.NoError(t, err)

		deleteReq := kmsg.AlterClientQuotasRequest{
			Entries: []kmsg.AlterClientQuotasRequestEntry{
				{
					Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
						{
							Type: entityTypeClientID,
							Name: &clientID,
						},
					},
					Ops: []kmsg.AlterClientQuotasRequestEntryOp{
						{
							Key:    producerByteRateKey,
							Remove: true,
						},
					},
				},
			},
		}

		err = consoleService.AlterQuotas(ctx, deleteReq)
		require.NoError(t, err)

		describeReq := kmsg.DescribeClientQuotasRequest{
			Components: []kmsg.DescribeClientQuotasRequestComponent{
				{
					EntityType: entityTypeClientID,
					MatchType:  matchTypeSpecific,
					Match:      &clientID,
				},
			},
		}

		resp := consoleService.DescribeQuotas(ctx, describeReq)
		require.Empty(t, resp.Error)
		require.NotEmpty(t, resp.Items)

		found := false
		for _, item := range resp.Items {
			if item.EntityType == entityTypeClientID && item.EntityName == clientID {
				found = true
				assert.Len(t, item.Settings, 1)
				assert.Equal(t, consumerByteRateKey, item.Settings[0].Key)
				assert.Equal(t, 2000000.0, item.Settings[0].Value)
				break
			}
		}
		assert.True(t, found, "client quota not found after deletion")
	})

	t.Run("create and delete flow", func(t *testing.T) {
		clientID := testClientFlow

		createReq := kmsg.AlterClientQuotasRequest{
			Entries: []kmsg.AlterClientQuotasRequestEntry{
				{
					Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
						{
							Type: entityTypeClientID,
							Name: &clientID,
						},
					},
					Ops: []kmsg.AlterClientQuotasRequestEntryOp{
						{
							Key:    producerByteRateKey,
							Value:  producerRate800KB,
							Remove: false,
						},
					},
				},
			},
		}

		err := consoleService.AlterQuotas(ctx, createReq)
		require.NoError(t, err)

		deleteReq := kmsg.AlterClientQuotasRequest{
			Entries: []kmsg.AlterClientQuotasRequestEntry{
				{
					Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
						{
							Type: entityTypeClientID,
							Name: &clientID,
						},
					},
					Ops: []kmsg.AlterClientQuotasRequestEntryOp{
						{
							Key:    producerByteRateKey,
							Remove: true,
						},
					},
				},
			},
		}

		err = consoleService.AlterQuotas(ctx, deleteReq)
		require.NoError(t, err)

		describeReq := kmsg.DescribeClientQuotasRequest{
			Components: []kmsg.DescribeClientQuotasRequestComponent{
				{
					EntityType: entityTypeClientID,
					MatchType:  matchTypeSpecific,
					Match:      &clientID,
				},
			},
		}

		resp := consoleService.DescribeQuotas(ctx, describeReq)
		require.Empty(t, resp.Error)

		for _, item := range resp.Items {
			if item.EntityType == entityTypeClientID && item.EntityName == clientID {
				assert.Empty(t, item.Settings, "quota settings should be empty after deletion")
			}
		}
	})
}
