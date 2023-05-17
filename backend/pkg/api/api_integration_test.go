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
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/cloudhut/common/logging"
	"github.com/cloudhut/common/rest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go/modules/redpanda"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

type APIIntegrationTestSuite struct {
	suite.Suite

	redpandaContainer *redpanda.Container

	kafkaClient      *kgo.Client
	kafkaAdminClient *kadm.Client

	cfg *config.Config
	api *API

	testSeedBroker string
}

func TestSuite(t *testing.T) {
	suite.Run(t, &APIIntegrationTestSuite{})
}

func (s *APIIntegrationTestSuite) SetupSuite() {
	t := s.T()
	require := require.New(t)

	ctx := context.Background()
	container, err := redpanda.RunContainer(ctx)
	require.NoError(err)
	s.redpandaContainer = container

	seedBroker, err := container.KafkaSeedBroker(ctx)
	require.NoError(err)

	s.testSeedBroker = seedBroker

	s.kafkaClient, s.kafkaAdminClient = testutil.CreateClients(t, []string{seedBroker})

	s.cfg = &config.Config{
		REST: config.Server{
			Config: rest.Config{
				HTTPListenAddress: "0.0.0.0",
				HTTPListenPort:    rand.Intn(50000) + 10000,
			},
		},
		Kafka: config.Kafka{
			Brokers: []string{s.testSeedBroker},
		},
		Connect: config.Connect{
			Enabled: false,
		},
		Logger: logging.Config{
			LogLevelInput: "info",
			LogLevel:      zap.NewAtomicLevel(),
		},
	}

	s.api = New(s.cfg)

	go s.api.Start()

	// allow for server to start
	timer1 := time.NewTimer(10 * time.Millisecond)
	<-timer1.C
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
	method, path string, input interface{},
) (*http.Response, []byte) {
	t := s.T()
	data, err := json.Marshal(input)
	require.NoError(t, err)

	req, err := http.NewRequestWithContext(ctx, method, s.httpAddress()+path, bytes.NewReader(data))
	require.NoError(t, err)

	req.Header.Set("Content-Type", "application/json")

	res, err := http.DefaultClient.Do(req)
	assert.NoError(t, err)

	body, err := io.ReadAll(res.Body)
	res.Body.Close()
	assert.NoError(t, err)

	return res, body
}
