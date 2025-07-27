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
	"net"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/redpanda-data/console/backend/pkg/config"
	kafkafactory "github.com/redpanda-data/console/backend/pkg/factory/kafka"
	loggerpkg "github.com/redpanda-data/console/backend/pkg/logger"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

func (s *ConsoleIntegrationTestSuite) TestGetClusterInfo() {
	t := s.T()
	assert := assert.New(t)
	require := require.New(t)

	ctx := context.Background()
	log := loggerpkg.NewSlogLogger(
		loggerpkg.WithFormat(loggerpkg.FormatText),
		loggerpkg.WithLevel(slog.LevelInfo),
	)

	testSeedBroker := s.testSeedBroker

	cfg := config.Config{}
	cfg.SetDefaults()
	cfg.MetricsNamespace = testutil.MetricNameForTest("get_cluster_info")
	cfg.Kafka.Brokers = []string{testSeedBroker}

	kafkaProvider := kafkafactory.NewCachedClientProvider(&cfg, log)
	svc, err := NewService(&cfg, log, kafkaProvider, nil, nil, nil, nil)
	require.NoError(err)
	defer svc.Stop()

	info, err := svc.GetClusterInfo(ctx)
	require.NoError(err)
	require.NotNil(info)

	require.Len(info.Brokers, 1)
	assert.NotEmpty(info.Brokers[0])

	expectedAddr, expectedPort, err := net.SplitHostPort(testSeedBroker)
	require.NoError(err)

	actualAddr, actualPort, err := net.SplitHostPort(testSeedBroker)
	require.NoError(err)

	assert.Equal(expectedAddr, actualAddr)
	assert.Equal(expectedPort, actualPort)
}
