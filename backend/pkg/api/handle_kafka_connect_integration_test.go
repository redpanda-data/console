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
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	con "github.com/cloudhut/connect-client"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/go-connections/nat"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/connect"
)

func (s *APIIntegrationTestSuite) TestHandleCreateConnector() {
	t := s.T()

	require := require.New(t)
	assert := assert.New(t)

	// setup
	ctx := context.Background()

	connectTestNetwork := "api_integration_redpanda_connect_test_network"

	// create one common network that all containers will share
	testNetwork, err := testcontainers.GenericNetwork(ctx, testcontainers.GenericNetworkRequest{
		ProviderType: testcontainers.ProviderDocker,
		NetworkRequest: testcontainers.NetworkRequest{
			Name:           connectTestNetwork,
			CheckDuplicate: true,
			Attachable:     true,
		},
	})
	require.NoError(err)

	commonNetwork := testNetwork

	// Redpanda container
	exposedPlainKafkaPort := rand.Intn(50000) + 10000 //nolint:gosec // We can use weak random numbers for ports in tests.
	exposedOutKafkaPort := rand.Intn(50000) + 10000   //nolint:gosec // We can use weak random numbers for ports in tests.
	exposedKafkaAdminPort := rand.Intn(50000) + 10000 //nolint:gosec // We can use weak random numbers for ports in tests.

	redpandaContainer, err := runRedpandaForConnect(ctx, connectTestNetwork, exposedPlainKafkaPort, exposedOutKafkaPort, exposedKafkaAdminPort)
	require.NoError(err)

	seedBroker, err := getMappedHostPort(ctx, redpandaContainer, nat.Port(strconv.FormatInt(int64(exposedOutKafkaPort), 10)+"/tcp"))
	require.NoError(err)

	// HTTPBin container
	httpC, err := runHTTPBin(ctx, connectTestNetwork)
	require.NoError(err)

	httpBinContainer := httpC

	// Kafka Connect container
	connectC, err := runConnect(connectTestNetwork, []string{"redpanda:" + strconv.FormatInt(int64(exposedPlainKafkaPort), 10)})
	require.NoError(err)

	connectContainer := connectC

	connectPort, err := connectContainer.MappedPort(ctx, nat.Port("8083"))
	require.NoError(err)

	connectHost, err := connectContainer.Host(ctx)
	require.NoError(err)

	// new connect service
	log, err := zap.NewProduction()
	require.NoError(err)

	connectCfg := config.Connect{}
	connectCfg.SetDefaults()
	connectCfg.Enabled = true
	connectCfg.Clusters = []config.ConnectCluster{
		{
			Name: "redpanda_connect",
			URL:  "http://" + connectHost + ":" + connectPort.Port(),
		},
	}

	newConnectSvc, err := connect.NewService(connectCfg, log)
	assert.NoError(err)

	// save old
	oldConnectSvc := s.api.ConnectSvc

	// switch
	s.api.ConnectSvc = newConnectSvc

	// reset connect service
	defer func() {
		s.api.ConnectSvc = oldConnectSvc
	}()

	t.Cleanup(func() {
		assert.NoError(httpBinContainer.Terminate(context.Background()))
		assert.NoError(connectContainer.Terminate(context.Background()))
		assert.NoError(redpandaContainer.Terminate(context.Background()))
		assert.NoError(commonNetwork.Remove(context.Background()))
	})

	t.Run("happy path", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		input := &createConnectorRequest{
			ConnectorName: "http_connect_input",
			Config: map[string]interface{}{
				"connector.class":                           "com.github.castorm.kafka.connect.http.HttpSourceConnector",
				"header.converter":                          "org.apache.kafka.connect.storage.SimpleHeaderConverter",
				"http.request.url":                          "http://httpbin:80/uuid",
				"http.timer.catchup.interval.millis":        "10000",
				"http.timer.interval.millis":                "1000",
				"kafka.topic":                               "httpbin-input",
				"key.converter":                             "org.apache.kafka.connect.json.JsonConverter",
				"key.converter.schemas.enable":              "false",
				"name":                                      "http_connect_input",
				"topic.creation.default.partitions":         "1",
				"topic.creation.default.replication.factor": "1",
				"topic.creation.enable":                     "true",
				"value.converter":                           "org.apache.kafka.connect.json.JsonConverter",
				"value.converter.schemas.enable":            "false",
			},
		}

		res, body := s.apiRequest(ctx, http.MethodPost, "/api/kafka-connect/clusters/redpanda_connect/connectors", input)

		require.Equal(200, res.StatusCode)

		createConnectRes := con.ConnectorInfo{}
		err := json.Unmarshal(body, &createConnectRes)
		assert.NoError(err)

		assert.Equal("http_connect_input", createConnectRes.Name)
		assert.Equal("httpbin-input", createConnectRes.Config["kafka.topic"])
		assert.Equal("1000", createConnectRes.Config["http.timer.interval.millis"])

		// timeout to allow for connect instance to perform few requests
		timer := time.NewTimer(3500 * time.Millisecond)
		<-timer.C

		cl, err := kgo.NewClient(
			kgo.SeedBrokers(seedBroker),
			kgo.ConsumeTopics("httpbin-input"),
			kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
		)
		require.NoError(err)

		defer cl.Close()

		type uuidValue struct {
			UUID string `json:"uuid"`
		}

		type recordValue struct {
			Value string `json:"value"`
			Key   string
		}

		records := make([][]byte, 0)

		// control polling end via context
		pollCtx, pollCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer pollCancel()

		// check the data in the sink topic
		for {
			fetches := cl.PollFetches(pollCtx)
			if fetches.IsClientClosed() {
				break
			}

			errs := fetches.Errors()
			if len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled)) {
				break
			}

			require.Empty(errs)

			fetches.EachRecord(func(record *kgo.Record) {
				records = append(records, record.Value)
			})
		}

		for _, vd := range records {
			rv := recordValue{}
			err := json.Unmarshal(vd, &rv)
			assert.NoError(err)
			assert.NotEmpty(rv.Value)

			uv := uuidValue{}
			err = json.Unmarshal([]byte(rv.Value), &uv)
			assert.NoError(err)

			_, err = uuid.Parse(uv.UUID)
			assert.NoError(err)
		}

		nRecords := len(records)
		assert.True(nRecords >= 3 && nRecords <= 5, "expect to have between 3 and 5 records. got: %d", nRecords)

		// check GET
		getRes, getBody := s.apiRequest(context.Background(), http.MethodGet, "/api/kafka-connect/clusters/redpanda_connect/connectors/http_connect_input", nil)
		require.Equal(200, getRes.StatusCode)

		getConnectRes := connect.ClusterConnectorInfo{}
		err = json.Unmarshal(getBody, &getConnectRes)
		assert.NoError(err)

		assert.Equal("http_connect_input", getConnectRes.Name)
		assert.Equal("httpbin-input", getConnectRes.Config["kafka.topic"])
		assert.Equal("1000", getConnectRes.Config["http.timer.interval.millis"])
	})
}

const testConnectConfig = `key.converter=org.apache.kafka.connect.converters.ByteArrayConverter
value.converter=org.apache.kafka.connect.converters.ByteArrayConverter
group.id=connectors-cluster
offset.storage.topic=_internal_connectors_offsets
config.storage.topic=_internal_connectors_configs
status.storage.topic=_internal_connectors_status
config.storage.replication.factor=-1
offset.storage.replication.factor=-1
status.storage.replication.factor=-1
`

func runConnect(network string, bootstrapServers []string) (testcontainers.Container, error) {
	const waitTimeout = 5 * time.Minute
	ctx, cancel := context.WithTimeout(context.Background(), waitTimeout)
	defer cancel()

	return testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Name:         "redpanda-connect",
			Image:        "docker.cloudsmith.io/redpanda/connectors-unsupported/connectors:v1.0.0-e80470f",
			ExposedPorts: []string{strconv.FormatInt(int64(nat.Port("8083/tcp").Int()), 10)},
			Env: map[string]string{
				"CONNECT_CONFIGURATION":     testConnectConfig,
				"CONNECT_BOOTSTRAP_SERVERS": strings.Join(bootstrapServers, ","),
				"CONNECT_GC_LOG_ENABLED":    "false",
				"CONNECT_HEAP_OPTS":         "-Xms512M -Xmx512M",
				"CONNECT_LOG_LEVEL":         "info",
			},
			Networks: []string{
				network,
			},
			NetworkAliases: map[string][]string{
				network: {"redpanda-connect"},
			},
			Hostname: "redpanda-connect",
			WaitingFor: wait.ForAll(
				wait.ForLog("Kafka Connect started").
					WithPollInterval(500 * time.Millisecond).
					WithStartupTimeout(waitTimeout),
			),
		},
		Started: true,
	})
}

func runRedpandaForConnect(ctx context.Context, network string, plaintextKafkaPort, outsideKafkaPort, exposedKafkaAdminPort int) (testcontainers.Container, error) {
	plainKafkaPort := strconv.FormatInt(int64(plaintextKafkaPort), 10)
	outKafkaPort := strconv.FormatInt(int64(outsideKafkaPort), 10)
	kafkaAdminPort := strconv.FormatInt(int64(exposedKafkaAdminPort), 10)
	registryPort := strconv.FormatInt(int64(rand.Intn(50000)+10000), 10) //nolint:gosec // We can use weak random numbers for ports in tests.

	req := testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Name:           "local-redpanda",
			Hostname:       "redpanda",
			Networks:       []string{network},
			NetworkAliases: map[string][]string{network: {"redpanda", "local-redpanda"}},
			Image:          "docker.redpanda.com/redpandadata/redpanda:v23.1.7",
			ExposedPorts: []string{
				plainKafkaPort,
				outKafkaPort,
				kafkaAdminPort,
				registryPort,
			},
			Cmd: []string{
				"redpanda start",
				"--smp 1",
				"--overprovisioned",
				fmt.Sprintf("--kafka-addr PLAINTEXT://0.0.0.0:%s,OUTSIDE://0.0.0.0:%s", plainKafkaPort, outKafkaPort),
				fmt.Sprintf("--advertise-kafka-addr PLAINTEXT://redpanda:%s,OUTSIDE://localhost:%s", plainKafkaPort, outKafkaPort),
			},
			HostConfigModifier: func(hostConfig *container.HostConfig) {
				hostConfig.PortBindings = nat.PortMap{
					nat.Port(outKafkaPort + "/tcp"): []nat.PortBinding{
						{
							HostIP:   "",
							HostPort: strconv.FormatInt(int64(nat.Port(outKafkaPort+"/tcp").Int()), 10),
						},
					},
					nat.Port(kafkaAdminPort + "/tcp"): []nat.PortBinding{
						{
							HostIP:   "",
							HostPort: strconv.FormatInt(int64(nat.Port(kafkaAdminPort+"/tcp").Int()), 10),
						},
					},
					nat.Port(registryPort + "/tcp"): []nat.PortBinding{
						{
							HostIP:   "",
							HostPort: strconv.FormatInt(int64(nat.Port(registryPort+"/tcp").Int()), 10),
						},
					},
					nat.Port(plainKafkaPort + "/tcp"): []nat.PortBinding{
						{
							HostIP:   "",
							HostPort: strconv.FormatInt(int64(nat.Port(plainKafkaPort+"/tcp").Int()), 10),
						},
					},
				}
			},
		},
		Started: true,
	}

	container, err := testcontainers.GenericContainer(ctx, req)
	if err != nil {
		return nil, err
	}

	err = wait.ForLog("Successfully started Redpanda!").
		WithPollInterval(100*time.Millisecond).
		WaitUntilReady(ctx, container)
	if err != nil {
		return nil, fmt.Errorf("failed to wait for Redpanda readiness: %w", err)
	}

	return container, nil
}

func runHTTPBin(ctx context.Context, network string) (testcontainers.Container, error) {
	req := testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Name:           "local-httpbin",
			Hostname:       "httpbin",
			Networks:       []string{network},
			NetworkAliases: map[string][]string{network: {"httpbin", "local-httpbin"}},
			Image:          "kennethreitz/httpbin",
			ExposedPorts:   []string{"80/tcp"},
			WaitingFor:     wait.ForHTTP("/"),
		},
		Started: true,
	}

	container, err := testcontainers.GenericContainer(ctx, req)
	if err != nil {
		return nil, err
	}

	return container, nil
}

func getMappedHostPort(ctx context.Context, c testcontainers.Container, port nat.Port) (string, error) {
	hostIP, err := c.Host(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get hostIP: %w", err)
	}

	mappedPort, err := c.MappedPort(ctx, port)
	if err != nil {
		return "", fmt.Errorf("failed to get mapped port: %w", err)
	}

	return fmt.Sprintf("%v:%d", hostIP, mappedPort.Int()), nil
}
