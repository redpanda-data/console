// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package console

import (
	"context"
	"log/slog"
	"os"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/redpanda-data/console/backend/pkg/config"
	kafkafactory "github.com/redpanda-data/console/backend/pkg/factory/kafka"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

func (s *ConsoleIntegrationTestSuite) TestGetTopicConfigs() {
	t := s.T()
	assert := assert.New(t)
	require := require.New(t)

	ctx := context.Background()
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))

	testSeedBroker := s.testSeedBroker
	topicName := testutil.TopicNameForTest("get_topic_configs")

	// setup
	_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, topicName)
	require.NoError(err)

	cfg := config.Config{}
	cfg.SetDefaults()
	cfg.MetricsNamespace = testutil.MetricNameForTest("get_topic_configs")
	cfg.Kafka.Brokers = []string{testSeedBroker}

	kafkaProvider := kafkafactory.NewCachedClientProvider(&cfg, log, prometheus.NewRegistry())
	svc, err := NewService(&cfg, log, kafkaProvider, nil, nil, nil, nil)
	require.NoError(err)

	defer svc.Stop()

	topicConfig, restErr := svc.GetTopicConfigs(ctx, topicName, nil)
	assert.Nil(restErr)
	assert.NotNil(topicConfig)
	assert.Equal(topicName, topicConfig.TopicName)
	assert.NotEmpty(topicConfig.ConfigEntries)

	// Create a map out of the returned config options to spot check compiled values
	configEntries := make(map[string]*TopicConfigEntry, len(topicConfig.ConfigEntries))
	for _, entry := range topicConfig.ConfigEntries {
		configEntries[entry.Name] = entry
	}

	// redpanda.remote.allowgaps isn't in the docs, but is coming from the server
	assert.Contains(configEntries, "redpanda.remote.allowgaps")
	assert.True(*configEntries["redpanda.remote.allowgaps"].Documentation != "")

	// redpanda.iceberg.mode is present in the rp json file, and should be in the Iceberg group
	assert.Contains(configEntries, "redpanda.iceberg.mode")
	assert.Equal(configEntries["redpanda.iceberg.mode"].ConfigCategory, "Iceberg")

	// redpanda.iceberg.delete is in the rp json file, but isn't returned by the server
	assert.NotContains(configEntries, "redpanda.iceberg.delete")

	// compression.type is in the kafka json file
	assert.Contains(configEntries, "compression.type")

	assert.NotNil(topicConfig.ConfigEntries[0])
	assert.False(topicConfig.ConfigEntries[0].IsReadOnly)
}
