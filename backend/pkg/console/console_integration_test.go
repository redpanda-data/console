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
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/redpanda"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"

	"github.com/redpanda-data/console/backend/pkg/testutil"
)

type ConsoleIntegrationTestSuite struct {
	suite.Suite

	redpandaContainer *redpanda.Container

	kafkaClient      *kgo.Client
	kafkaAdminClient *kadm.Client
	kafkaSRClient    *sr.Client

	testSeedBroker string
	registryAddr   string
}

func TestSuite(t *testing.T) {
	suite.Run(t, &ConsoleIntegrationTestSuite{})
}

func (s *ConsoleIntegrationTestSuite) SetupSuite() {
	t := s.T()
	require := require.New(t)

	ctx := context.Background()
	container, err := redpanda.RunContainer(ctx, withImage("redpandadata/redpanda:v23.2.6"))
	require.NoError(err)
	s.redpandaContainer = container

	seedBroker, err := container.KafkaSeedBroker(ctx)
	require.NoError(err)

	s.testSeedBroker = seedBroker

	s.kafkaClient, s.kafkaAdminClient = testutil.CreateClients(t, []string{seedBroker})

	registryAddr, err := container.SchemaRegistryAddress(ctx)
	require.NoError(err)

	s.registryAddr = registryAddr

	rcl, err := sr.NewClient(sr.URLs(registryAddr))
	require.NoError(err)
	s.kafkaSRClient = rcl
}

func (s *ConsoleIntegrationTestSuite) TearDownSuite() {
	t := s.T()
	assert := require.New(t)

	assert.NoError(s.redpandaContainer.Terminate(context.Background()))
}

func withImage(image string) testcontainers.CustomizeRequestOption {
	return func(req *testcontainers.GenericContainerRequest) {
		req.Image = image
	}
}
