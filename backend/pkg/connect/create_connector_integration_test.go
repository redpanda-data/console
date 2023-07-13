package connect

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
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
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
)

var (
	testSeedBroker      []string
	testAdminAddress    string
	redpandaContainerIP string
	httpContainerIP     string
)

const (
	TEST_TOPIC_NAME      = "test_redpanda_connect_topic"
	CONNECT_TEST_NETWORK = "redpandaconnecttestnetwork"
)

func Test_CreateConnector(t *testing.T) {
	fmt.Printf("TEST SEED BROKERS: %+v\n", testSeedBroker)

	kc := startConnect(t, CONNECT_TEST_NETWORK, []string{"redpanda:29092"})
	fmt.Printf("\n%+v\n", kc)

	defer func() {
		ctx := context.Background()

		if err := kc.Terminate(ctx); err != nil {
			panic(err)
		}
	}()

	log, err := zap.NewProduction()
	require.NoError(t, err)

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

	require.NoError(t, err)

	// test
	ctx := context.Background()
	res, connectErr := connectSvs.CreateConnector(ctx, "redpanda_connect", connect.CreateConnectorRequest{
		Name: "http_connect_input",
		Config: map[string]interface{}{
			"connector.class":                           "com.github.castorm.kafka.connect.http.HttpSourceConnector",
			"header.converter":                          "org.apache.kafka.connect.storage.SimpleHeaderConverter",
			"http.request.url":                          httpContainerIP + "/uuid",
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

	if connectErr != nil {
		assert.NoError(t, connectErr.Err)
	}

	rj, _ := json.Marshal(res)
	fmt.Println("RES:")
	fmt.Println(string(rj))
	fmt.Println()

	timer := time.NewTimer(35 * time.Second)
	<-timer.C

	duration := 10 * time.Second
	err = kc.Container.Stop(ctx, &duration)
	require.NoError(t, err)

	cl, err := kgo.NewClient(
		kgo.SeedBrokers(testSeedBroker...),
		kgo.ConsumeTopics("httpbin-input"),
		kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
	)
	require.NoError(t, err)

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
			fmt.Println("client closed")
			break
		}

		errs := fetches.Errors()
		if len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled)) {
			fmt.Println("deadline exceeded / canceled")
			break
		}

		require.Empty(t, errs)

		fetches.EachRecord(func(record *kgo.Record) {
			fmt.Println(string(record.Value), "from an iterator!")
			records = append(records, record.Value)
		})
	}

	for _, vd := range records {
		rv := recordValue{}
		err := json.Unmarshal(vd, &rv)
		assert.NoError(t, err)
		assert.NotEmpty(t, rv.Value)

		uv := uuidValue{}
		err = json.Unmarshal([]byte(rv.Value), &uv)
		assert.NoError(t, err)

		_, err = uuid.Parse(uv.Uuid)
		assert.NoError(t, err)
	}

	assert.Len(t, records, 4)
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
		HostConfigModifier: func(hc *container.HostConfig) {
			// hc.NetworkMode = "host"
			hc.PortBindings = nat.PortMap{
				nat.Port("8083/tcp"): []nat.PortBinding{
					{
						HostIP:   "",
						HostPort: strconv.FormatInt(int64(nat.Port("8083/tcp").Int()), 10),
					},
				},
			}
		},
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

type Connect struct {
	testcontainers.Container

	connectPort nat.Port
	connectHost string
}

func WithNetwork(network string, networkAlias []string) testcontainers.CustomizeRequestOption {
	return func(req *testcontainers.GenericContainerRequest) {
		if len(req.Networks) == 0 {
			req.Networks = []string{}
		}
		req.Networks = append(req.Networks, network)

		if len(networkAlias) > 0 {
			if len(req.NetworkAliases) == 0 {
				req.NetworkAliases = map[string][]string{}
			}

			req.NetworkAliases[network] = append(req.NetworkAliases[network], networkAlias...)
		}
	}
}

func WithHostname(hostname string) testcontainers.CustomizeRequestOption {
	return func(req *testcontainers.GenericContainerRequest) {
		req.Hostname = hostname
	}
}

func WithName(name string) testcontainers.CustomizeRequestOption {
	return func(req *testcontainers.GenericContainerRequest) {
		req.Name = name
	}
}

func WithStart(value bool) testcontainers.CustomizeRequestOption {
	return func(req *testcontainers.GenericContainerRequest) {
		req.Started = value
	}
}

func WithExposedPorts() testcontainers.CustomizeRequestOption {
	return func(req *testcontainers.GenericContainerRequest) {
		req.ExposedPorts = []string{
			strconv.FormatInt(int64(nat.Port("9092/tcp").Int()), 10),
			strconv.FormatInt(int64(nat.Port("9644/tcp").Int()), 10),
			strconv.FormatInt(int64(nat.Port("8081/tcp").Int()), 10),
			strconv.FormatInt(int64(nat.Port("8082/tcp").Int()), 10),
			"29092",
		}
	}
}

func TestMain(m *testing.M) {
	os.Exit(func() int {
		ctx := context.Background()

		testNetwork, err := testcontainers.GenericNetwork(ctx, testcontainers.GenericNetworkRequest{
			ProviderType: testcontainers.ProviderDocker,
			NetworkRequest: testcontainers.NetworkRequest{
				Name:           CONNECT_TEST_NETWORK,
				CheckDuplicate: true,
				Attachable:     true,
			},
		})
		if err != nil {
			panic(err)
		}

		container, err := runRedpanda(ctx, CONNECT_TEST_NETWORK)
		if err != nil {
			panic(err)
		}

		httpC, err := runHTTPBin(ctx, CONNECT_TEST_NETWORK)
		if err != nil {
			panic(err)
		}

		httpIP, err := container.Host(ctx)
		if err != nil {
			panic(err)
		}

		httpMappedPort, err := httpC.MappedPort(ctx, "80")
		if err != nil {
			panic(err)
		}

		uri := fmt.Sprintf("http://%s:%s", httpIP, httpMappedPort.Port())
		fmt.Println("!!! HTTP uri:", uri)
		httpContainerIP = fmt.Sprintf("http://httpbin:%s", "80")

		defer func() {
			if err := container.Terminate(ctx); err != nil {
				panic(err)
			}

			if err := httpC.Terminate(ctx); err != nil {
				panic(err)
			}

			if err := testNetwork.Remove(ctx); err != nil {
				panic(err)
			}
		}()

		port, err := container.MappedPort(ctx, nat.Port("9092/tcp"))
		fmt.Println("port:", port, err)

		seedBroker, err := getMappedHostPort(ctx, container, nat.Port("9092/tcp"))
		if err != nil {
			panic(err)
		}

		fmt.Println("seedBroker:", seedBroker)
		testSeedBroker = []string{seedBroker}

		// create a long lived stock test topic
		kafkaCl, err := kgo.NewClient(
			kgo.SeedBrokers(seedBroker),
		)
		if err != nil {
			panic(err)
		}

		kafkaCl.Close()

		return m.Run()
	}())
}

const redpandaCustomYaml = `
redpanda:
  admin:
    address: 0.0.0.0
    port: 9644
  kafka_api:
	- address: 0.0.0.0
	  name: OUTSIDE
	  port: 9092
	- address: 0.0.0.0
      port: 29092
      name: PLAINTEXT
  advertised_kafka_api:
	- address: redpanda
	  port: 29092
	  name: PLAINTEXT
	- address: localhost
	  port: 9092
	  name: OUTSIDE
  developer_mode: true
  auto_create_topics_enabled: true

schema_registry:
  schema_registry_api:
  - address: "0.0.0.0"
    name: main
    port: 8081
    authentication_method: {{ .SchemaRegistry.AuthenticationMethod }}

schema_registry_client:
  brokers:
    - address: localhost
      port: 9093
`

func runRedpanda(ctx context.Context, network string) (testcontainers.Container, error) {
	req := testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Name:           "local-redpanda",
			Hostname:       "redpanda",
			Networks:       []string{network},
			NetworkAliases: map[string][]string{network: {"redpanda", "local-redpanda"}},
			Image:          "docker.redpanda.com/redpandadata/redpanda:v23.1.7",
			ExposedPorts: []string{
				strconv.FormatInt(int64(nat.Port("9092/tcp").Int()), 10),
				strconv.FormatInt(int64(nat.Port("9644/tcp").Int()), 10),
				strconv.FormatInt(int64(nat.Port("8081/tcp").Int()), 10),
				strconv.FormatInt(int64(nat.Port("8082/tcp").Int()), 10),
				"29092",
			},
			Cmd: []string{
				"redpanda start",
				"--smp 1",
				"--overprovisioned",
				"--kafka-addr PLAINTEXT://0.0.0.0:29092,OUTSIDE://0.0.0.0:9092",
				"--advertise-kafka-addr PLAINTEXT://redpanda:29092,OUTSIDE://localhost:9092",
				"--pandaproxy-addr 0.0.0.0:8082",
				"--advertise-pandaproxy-addr localhost:8082",
			},
			HostConfigModifier: func(hostConfig *container.HostConfig) {
				hostConfig.PortBindings = nat.PortMap{
					nat.Port("9092/tcp"): []nat.PortBinding{
						{
							HostIP:   "",
							HostPort: strconv.FormatInt(int64(nat.Port("9092/tcp").Int()), 10),
						},
					},
					nat.Port("9644/tcp"): []nat.PortBinding{
						{
							HostIP:   "",
							HostPort: strconv.FormatInt(int64(nat.Port("9644/tcp").Int()), 10),
						},
					},
					nat.Port("8081/tcp"): []nat.PortBinding{
						{
							HostIP:   "",
							HostPort: strconv.FormatInt(int64(nat.Port("8081/tcp").Int()), 10),
						},
					},
					nat.Port("8082/tcp"): []nat.PortBinding{
						{
							HostIP:   "",
							HostPort: strconv.FormatInt(int64(nat.Port("8082/tcp").Int()), 10),
						},
					},
					nat.Port("29092/tcp"): []nat.PortBinding{
						{
							HostIP:   "",
							HostPort: strconv.FormatInt(int64(nat.Port("29092/tcp").Int()), 10),
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
