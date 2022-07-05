// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package integrationtest

import (
	"context"
	"testing"
	"time"

	"github.com/redpanda-data/console/backend/pkg/testcontainers"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
)

// TestRedpandaConsole will run the integration tests for Redpanda Console.
func TestRedpandaConsole(t *testing.T) {
	suite.Run(t, &RedpandaConsoleTest{})
}

type RedpandaConsoleTest struct {
	suite.Suite

	redpandaContainer *testcontainers.Redpanda
	kAdm              *kadm.Client
}

// SetupTest will set up all dependencies that are required for the integration tests.
func (s *RedpandaConsoleTest) SetupTest() {
	t := s.T()
	assert := require.New(t)

	s.SetupContainers()

	// 2. Utilities
	kgoClient, err := kgo.NewClient(kgo.SeedBrokers(s.redpandaContainer.KafkaAddr))
	assert.NoError(err)
	kAdm := kadm.NewClient(kgoClient)
	s.kAdm = kAdm
}

// SetupContainers will launch all Docker containers (such as Redpanda) that are required to perform
// the integration tests.
func (s *RedpandaConsoleTest) SetupContainers() {
	t := s.T()

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Minute)
	defer cancel()

	kafkaPort, err := GetFreePort()
	require.NoError(t, err)
	httpPort, err := GetFreePort()
	require.NoError(t, err)
	redpanda, err := testcontainers.NewRedpanda(ctx,
		testcontainers.WithContainerKafkaPort(kafkaPort),
		testcontainers.WithContainerHTTPPort(httpPort),
	)
	require.NoError(t, err)
	s.redpandaContainer = redpanda
}

// TearDownTest cleans up the resources that have been created before running the tests.
func (s *RedpandaConsoleTest) TearDownTest() {
	t := s.T()
	assert := require.New(t)

	ctx := context.Background()
	err := s.redpandaContainer.Terminate(ctx)
	assert.NoError(err)
}
