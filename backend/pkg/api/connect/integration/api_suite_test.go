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
	"math/rand"
	"net"
	"strconv"
	"testing"
	"time"

	"github.com/cloudhut/common/rest"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/redpanda"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/redpanda-data/console/backend/pkg/api"
	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

type APISuite struct {
	suite.Suite

	redpandaContainer *redpanda.Container
	kafkaClient       *kgo.Client
	kafkaAdminClient  *kadm.Client

	cfg *config.Config
	api *api.API

	testSeedBroker string
}

func TestSuite(t *testing.T) {
	suite.Run(t, &APISuite{})
}

func (s *APISuite) SetupSuite() {
	t := s.T()
	require := require.New(t)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// 1. Start Redpanda Docker container
	container, err := redpanda.RunContainer(ctx, testcontainers.WithImage("redpandadata/redpanda:v23.2.18"))
	container.FollowOutput(testutil.TestContainersLogger{LogPrefix: "CONTAINER (connect-integration): "})
	require.NoError(container.StartLogProducer(context.Background()))

	require.NoError(err)
	s.redpandaContainer = container

	// 2. Retrieve connection details
	seedBroker, err := container.KafkaSeedBroker(ctx)
	require.NoError(err)
	schemaRegistryAddress, err := container.SchemaRegistryAddress(ctx)
	require.NoError(err)

	s.testSeedBroker = seedBroker

	// 3. Create Kafka clients
	s.kafkaClient, s.kafkaAdminClient = testutil.CreateClients(t, []string{seedBroker})

	// 4. Configure & start Redpanda Console
	httpListenPort := rand.Intn(50000) + 10000
	s.cfg = &config.Config{}
	s.cfg.SetDefaults()
	s.cfg.ServeFrontend = false
	s.cfg.REST = config.Server{
		Config: rest.Config{
			HTTPListenAddress: "0.0.0.0",
			HTTPListenPort:    httpListenPort,
		},
	}
	s.cfg.Kafka.Brokers = []string{s.testSeedBroker}
	s.cfg.Kafka.Schema.Enabled = true
	s.cfg.Kafka.Schema.URLs = []string{schemaRegistryAddress}
	s.api = api.New(s.cfg)

	go s.api.Start()

	// 5. Wait until Console API is up
	httpServerAddress := net.JoinHostPort("localhost", strconv.Itoa(httpListenPort))
	retries := 60
	for retries > 0 {
		if _, err := net.DialTimeout("tcp", httpServerAddress, 100*time.Millisecond); err == nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
		retries--
	}
}

func (s *APISuite) TearDownSuite() {
	t := s.T()
	assert := require.New(t)

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	assert.NoError(s.redpandaContainer.Terminate(ctx))
	assert.NoError(s.api.Stop(ctx))
}

func (s *APISuite) httpAddress() string {
	if s.api.Cfg.REST.TLS.Enabled {
		return "https://" + s.api.Cfg.REST.HTTPListenAddress + ":" + strconv.FormatInt(int64(s.api.Cfg.REST.HTTPSListenPort), 10)
	}
	return "http://" + s.api.Cfg.REST.HTTPListenAddress + ":" + strconv.FormatInt(int64(s.api.Cfg.REST.HTTPListenPort), 10)
}
