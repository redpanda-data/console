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
	"net"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

func (s *ConsoleIntegrationTestSuite) TestGetClusterInfo() {
	t := s.T()
	assert := assert.New(t)
	require := require.New(t)

	ctx := context.Background()
	logCfg := zap.NewDevelopmentConfig()
	logCfg.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
	log, err := logCfg.Build()
	require.NoError(err)

	testSeedBroker := s.testSeedBroker

	cfg := config.Config{}
	cfg.SetDefaults()
	cfg.MetricsNamespace = testutil.MetricNameForTest("get_cluster_info")
	cfg.Kafka.Brokers = []string{testSeedBroker}

	svc, err := NewService(&cfg, log, nil, nil)
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
