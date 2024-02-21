// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"math/rand"
	"net"
	"net/http"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/cloudhut/common/rest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/redpanda"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

type APIIntegrationTestSuite struct {
	suite.Suite

	redpandaContainer *redpanda.Container

	kafkaClient      *kgo.Client
	kafkaAdminClient *kadm.Client
	kafkaSRClient    *sr.Client

	cfg *config.Config
	api *API

	testSeedBroker string
	registryAddr   string
}

func TestSuite(t *testing.T) {
	suite.Run(t, &APIIntegrationTestSuite{})
}

func (s *APIIntegrationTestSuite) SetupSuite() {
	t := s.T()
	require := require.New(t)

	ctx := context.Background()
	container, err := redpanda.RunContainer(ctx, testcontainers.WithImage("redpandadata/redpanda:v23.3.2"))
	require.NoError(err)
	s.redpandaContainer = container

	seedBroker, err := container.KafkaSeedBroker(ctx)
	require.NoError(err)
	registryAddr, err := container.SchemaRegistryAddress(ctx)
	require.NoError(err)

	s.testSeedBroker = seedBroker

	s.kafkaClient, s.kafkaAdminClient = testutil.CreateClients(t, []string{seedBroker})

	s.registryAddr = registryAddr

	rcl, err := sr.NewClient(sr.URLs(registryAddr))
	require.NoError(err)
	s.kafkaSRClient = rcl

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
	s.cfg.Kafka.Protobuf.Enabled = true
	s.cfg.Kafka.Protobuf.SchemaRegistry.Enabled = true
	s.cfg.Kafka.Protobuf.SchemaRegistry.RefreshInterval = 2 * time.Second
	s.cfg.Kafka.Schema.Enabled = true
	s.cfg.Kafka.Schema.URLs = []string{registryAddr}

	// proto message mapping
	absProtoPath, err := filepath.Abs("../testutil/testdata/proto")
	require.NoError(err)
	s.cfg.Kafka.Protobuf.Enabled = true
	s.cfg.Kafka.Protobuf.Mappings = []config.ProtoTopicMapping{
		{
			TopicName:      testutil.TopicNameForTest("publish_messages_proto_plain"),
			ValueProtoType: "testutil.things.v1.Item",
		},
	}
	s.cfg.Kafka.Protobuf.FileSystem.Enabled = true
	s.cfg.Kafka.Protobuf.FileSystem.RefreshInterval = 1 * time.Minute
	s.cfg.Kafka.Protobuf.FileSystem.Paths = []string{absProtoPath}

	s.api = New(s.cfg)

	go s.api.Start()

	// allow for server to start
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

func (s *APIIntegrationTestSuite) TearDownSuite() {
	t := s.T()
	assert := require.New(t)

	assert.NoError(s.redpandaContainer.Terminate(context.Background()))

	assert.NoError(s.api.server.Server.Shutdown(context.Background()))
}

func (s *APIIntegrationTestSuite) httpAddress() string {
	if s.api.Cfg.REST.TLS.Enabled {
		return "https://" + s.api.Cfg.REST.HTTPListenAddress + ":" + strconv.FormatInt(int64(s.api.Cfg.REST.HTTPSListenPort), 10)
	}
	return "http://" + s.api.Cfg.REST.HTTPListenAddress + ":" + strconv.FormatInt(int64(s.api.Cfg.REST.HTTPListenPort), 10)
}

func (s *APIIntegrationTestSuite) copyConfig() *config.Config {
	t := s.T()

	// hacky way to copy config struct
	cfgJSON, err := json.Marshal(s.cfg)
	require.NoError(t, err)

	newConfig := config.Config{}
	err = json.Unmarshal(cfgJSON, &newConfig)
	require.NoError(t, err)

	return &newConfig
}

func (s *APIIntegrationTestSuite) apiRequest(ctx context.Context,
	method, path string, input any,
) (*http.Response, []byte) {
	t := s.T()

	var err error
	var data []byte
	if input != nil {
		data, err = json.Marshal(input)
		require.NoError(t, err)
	}

	req, err := http.NewRequestWithContext(ctx, method, s.httpAddress()+path, bytes.NewReader(data))
	require.NoError(t, err)

	req.Header.Set("Content-Type", "application/json")

	res, err := http.DefaultClient.Do(req)
	require.NoError(t, err)

	body, err := io.ReadAll(res.Body)
	res.Body.Close()
	assert.NoError(t, err)

	return res, body
}

func (s *APIIntegrationTestSuite) consumerClientForTopic(topicName string) *kgo.Client {
	t := s.T()
	require := require.New(t)

	cl, err := kgo.NewClient(
		kgo.SeedBrokers(s.testSeedBroker),
		kgo.ConsumeTopics(topicName),
		kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
	)
	require.NoError(err)

	return cl
}
