package connect

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/cloudhut/connect-client"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/go-connections/nat"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
)

const (
	TEST_TOPIC_NAME      = "test_redpanda_connect_topic"
	CONNECT_TEST_NETWORK = "redpandaconnecttestnetwork"
)

type Connect struct {
	testcontainers.Container

	connectPort nat.Port
	connectHost string
}

type ConnectIntegrationTestSuite struct {
	suite.Suite

	commonNetwork     testcontainers.Network
	redpandaContainer testcontainers.Container
	connectContainer  testcontainers.Container
	httpBinContainer  testcontainers.Container

	connectSvs *Service

	testSeedBroker        string
	exposedPlainKafkaPort int
	exposedOutKafkaPort   int
	connectPort           nat.Port
	connectHost           string
}

func TestSuite(t *testing.T) {
	suite.Run(t, &ConnectIntegrationTestSuite{})
}

func (s *ConnectIntegrationTestSuite) SetupSuite() {
	t := s.T()
	require := require.New(t)

	ctx := context.Background()

	testNetwork, err := testcontainers.GenericNetwork(ctx, testcontainers.GenericNetworkRequest{
		ProviderType: testcontainers.ProviderDocker,
		NetworkRequest: testcontainers.NetworkRequest{
			Name:           CONNECT_TEST_NETWORK,
			CheckDuplicate: true,
			Attachable:     true,
		},
	})
	require.NoError(err)

	s.commonNetwork = testNetwork

	s.exposedPlainKafkaPort = rand.Intn(60000) + 10000
	s.exposedOutKafkaPort = rand.Intn(60000) + 10000
	exposedKafkaAdminPort := rand.Intn(60000) + 10000
	registryPort := rand.Intn(60000) + 10000

	rpC, err := runRedpanda(ctx, CONNECT_TEST_NETWORK, s.exposedPlainKafkaPort, s.exposedOutKafkaPort, exposedKafkaAdminPort, registryPort)
	require.NoError(err)

	s.redpandaContainer = rpC

	seedBroker, err := getMappedHostPort(ctx, rpC, nat.Port(strconv.FormatInt(int64(s.exposedOutKafkaPort), 10)+"/tcp"))
	require.NoError(err)

	s.testSeedBroker = seedBroker

	httpC, err := runHTTPBin(ctx, CONNECT_TEST_NETWORK)
	require.NoError(err)

	s.httpBinContainer = httpC

	kc := startConnect(t, CONNECT_TEST_NETWORK, []string{"redpanda:" + strconv.FormatInt(int64(s.exposedPlainKafkaPort), 10)})

	s.connectContainer = kc.Container
	s.connectHost = kc.connectHost
	s.connectPort = kc.connectPort

	log, err := zap.NewProduction()
	require.NoError(err)

	// create
	connectSvs, err := NewService(config.Connect{
		Enabled: true,
		Clusters: []config.ConnectCluster{
			{
				Name: "redpanda_connect",
				URL:  "http://" + kc.connectHost + ":" + string(kc.connectPort.Port()),
			},
		},
	}, log)

	require.NoError(err)

	s.connectSvs = connectSvs
}

func (s *ConnectIntegrationTestSuite) TearDownSuite() {
	t := s.T()
	assert := require.New(t)

	assert.NoError(s.redpandaContainer.Terminate(context.Background()))
	assert.NoError(s.httpBinContainer.Terminate(context.Background()))
	assert.NoError(s.connectContainer.Terminate(context.Background()))
	assert.NoError(s.commonNetwork.Remove(context.Background()))
}

func (s *ConnectIntegrationTestSuite) TestCreateConnector() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	ctx := context.Background()

	res, connectErr := s.connectSvs.CreateConnector(ctx, "redpanda_connect", connect.CreateConnectorRequest{
		Name: "http_connect_input",
		Config: map[string]interface{}{
			"connector.class":                           "com.github.castorm.kafka.connect.http.HttpSourceConnector",
			"header.converter":                          "org.apache.kafka.connect.storage.SimpleHeaderConverter",
			"http.request.url":                          "http://httpbin:80/uuid",
			"http.timer.catchup.interval.millis":        "10000",
			"http.timer.interval.millis":                "10000",
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
	})

	require.Empty(connectErr)
	assert.NotNil(res)

	timer := time.NewTimer(35 * time.Second)
	<-timer.C

	duration := 10 * time.Second
	err := s.connectContainer.Stop(ctx, &duration)
	require.NoError(err)

	cl, err := kgo.NewClient(
		kgo.SeedBrokers(s.testSeedBroker),
		kgo.ConsumeTopics("httpbin-input"),
		kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
	)
	require.NoError(err)

	defer cl.Close()

	const waitTimeout = 10 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), waitTimeout)
	defer cancel()

	type uuidValue struct {
		Uuid string `json:"uuid"`
	}

	type recordValue struct {
		Value string `json:"value"`
		Key   string
	}

	records := make([][]byte, 0)

	for {
		fetches := cl.PollFetches(ctx)
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

		_, err = uuid.Parse(uv.Uuid)
		assert.NoError(err)
	}

	assert.Len(records, 4)
}

const CONNECT_CONFIGURATION = `key.converter=org.apache.kafka.connect.converters.ByteArrayConverter
value.converter=org.apache.kafka.connect.converters.ByteArrayConverter
group.id=connectors-cluster
offset.storage.topic=_internal_connectors_offsets
config.storage.topic=_internal_connectors_configs
status.storage.topic=_internal_connectors_status
config.storage.replication.factor=-1
offset.storage.replication.factor=-1
status.storage.replication.factor=-1
offset.flush.interval.ms=1000
producer.linger.ms=1
producer.batch.size=131072
`

func startConnect(t *testing.T, network string, bootstrapServers []string) *Connect {
	t.Helper()

	const waitTimeout = 5 * time.Minute
	ctx, cancel := context.WithTimeout(context.Background(), waitTimeout)
	defer cancel()

	req := testcontainers.ContainerRequest{
		Name:         "redpanda-connect",
		Image:        "docker.cloudsmith.io/redpanda/cloudv2-dev/connectors:v1.0.0-6955117",
		ExposedPorts: []string{strconv.FormatInt(int64(nat.Port("8083/tcp").Int()), 10)},
		Env: map[string]string{
			"CONNECT_CONFIGURATION":     CONNECT_CONFIGURATION,
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
	}

	connectContainer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	require.NoError(t, err)

	connectPort, err := connectContainer.MappedPort(ctx, nat.Port("8083"))
	require.NoError(t, err)

	connectHost, err := connectContainer.Host(ctx)
	require.NoError(t, err)

	kc := Connect{
		Container:   connectContainer,
		connectPort: connectPort,
		connectHost: connectHost,
	}

	return &kc
}

func runRedpanda(ctx context.Context, network string, plaintextKafkaPort, outsideKafkaPort, exposedKafkaAdminPort, exposedRegistryPort int) (testcontainers.Container, error) {
	plainKafkaPort := strconv.FormatInt(int64(plaintextKafkaPort), 10)
	outKafkaPort := strconv.FormatInt(int64(outsideKafkaPort), 10)
	kafkaAdminPort := strconv.FormatInt(int64(exposedKafkaAdminPort), 10)
	registryPort := strconv.FormatInt(int64(exposedRegistryPort), 10)

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
