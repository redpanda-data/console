// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package kafka

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/go-connections/nat"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
	"go.uber.org/zap"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/redpanda-data/console/backend/pkg/config"
	shopv1 "github.com/redpanda-data/console/backend/pkg/kafka/testdata/proto/gen/shop/v1"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

type KafkaIntegrationTestSuite struct {
	suite.Suite

	redpandaContainer testcontainers.Container

	kafkaClient      *kgo.Client
	kafkaAdminClient *kadm.Client

	seedBroker      string
	registryAddress string
	log             *zap.Logger
}

func TestSuite(t *testing.T) {
	suite.Run(t, &KafkaIntegrationTestSuite{})
}

func (s *KafkaIntegrationTestSuite) createBaseConfig() config.Config {
	cfg := config.Config{}
	cfg.SetDefaults()
	cfg.MetricsNamespace = testutil.MetricNameForTest("deserializer")
	cfg.Kafka.Brokers = []string{s.seedBroker}

	return cfg
}

func (s *KafkaIntegrationTestSuite) consumerClientForTopic(topicName string) *kgo.Client {
	t := s.T()
	require := require.New(t)

	cl, err := kgo.NewClient(
		kgo.SeedBrokers(s.seedBroker),
		kgo.ConsumeTopics(topicName),
		kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
	)
	require.NoError(err)

	return cl
}

func (s *KafkaIntegrationTestSuite) SetupSuite() {
	t := s.T()
	require := require.New(t)

	ctx := context.Background()

	// Redpanda container
	exposedKafkaPort := rand.Intn(50000) + 10000 //nolint:gosec // We can use weak random numbers for ports in tests.
	// externalKafkaPort := rand.Intn(50000) + 10000 //nolint:gosec // We can use weak random numbers for ports in tests.
	// exposedKafkaAdminPort := rand.Intn(50000) + 10000 //nolint:gosec // We can use weak random numbers for ports in tests.
	schemaRegistryPort := rand.Intn(50000) + 10000 //nolint:gosec // We can use weak random numbers for ports in tests.

	redpandaContainer, err := runRedpandaForKafkaTests(ctx, exposedKafkaPort, schemaRegistryPort)
	require.NoError(err)

	s.redpandaContainer = redpandaContainer

	seedBroker, err := getMappedHostPort(ctx, redpandaContainer, nat.Port(strconv.FormatInt(int64(exposedKafkaPort), 10)+"/tcp"))
	require.NoError(err)

	s.seedBroker = seedBroker
	s.kafkaClient, s.kafkaAdminClient = testutil.CreateClients(t, []string{seedBroker})

	registryAddr, err := getMappedHostPort(ctx, redpandaContainer, nat.Port(strconv.FormatInt(int64(schemaRegistryPort), 10)+"/tcp"))
	require.NoError(err)
	s.registryAddress = registryAddr

	logCfg := zap.NewDevelopmentConfig()
	logCfg.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
	log, err := logCfg.Build()
	require.NoError(err)

	s.log = log
}

func (s *KafkaIntegrationTestSuite) TearDownSuite() {
	t := s.T()
	assert := require.New(t)

	assert.NoError(s.redpandaContainer.Terminate(context.Background()))
}

func (s *KafkaIntegrationTestSuite) TestDeserializeRecord() {
	t := s.T()

	require := require.New(t)
	assert := assert.New(t)

	ctx := context.Background()

	t.Run("plain JSON", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("deserializer_plain_json")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		cfg := s.createBaseConfig()
		cfg.Kafka.Protobuf.Enabled = true
		cfg.Kafka.Protobuf.SchemaRegistry.Enabled = true
		cfg.Kafka.Schema.Enabled = true
		cfg.Kafka.Schema.URLs = []string{"http://" + s.registryAddress}

		metricName := testutil.MetricNameForTest(strings.ReplaceAll("deserializer", " ", ""))

		svc, err := NewService(&cfg, s.log, metricName)
		require.NoError(err)

		svc.Start()

		order := testutil.Order{ID: strconv.Itoa(123)}
		serializedOrder, err := json.Marshal(order)
		require.NoError(err)

		recordTimeStamp := time.Date(2010, time.November, 10, 13, 0, 0, 0, time.UTC)

		r := &kgo.Record{
			Key:       []byte(order.ID),
			Value:     serializedOrder,
			Topic:     testTopicName,
			Timestamp: recordTimeStamp,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record
		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := svc.Deserializer.DeserializeRecord(record)
		require.NotNil(dr)
		assert.Equal(messageEncodingJSON, dr.Value.Payload.RecognizedEncoding)
		assert.IsType(map[string]interface{}{}, dr.Value.Object)

		rOrder := testutil.Order{}
		err = json.Unmarshal(dr.Value.Payload.Payload, &rOrder)
		assert.NoError(err)
		assert.Equal("123", rOrder.ID)
	})

	t.Run("plain protobuf", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("deserializer_plain_protobuf")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		cfg := s.createBaseConfig()
		cfg.Kafka.Protobuf.Enabled = true
		cfg.Kafka.Protobuf.Mappings = []config.ProtoTopicMapping{
			{
				TopicName:      testTopicName,
				ValueProtoType: "shop.v1.Order",
			},
		}
		cfg.Kafka.Protobuf.FileSystem.Enabled = true
		cfg.Kafka.Protobuf.FileSystem.RefreshInterval = 1 * time.Minute
		cfg.Kafka.Protobuf.FileSystem.Paths = []string{"testdata/proto"}

		metricName := testutil.MetricNameForTest(strings.ReplaceAll("deserializer", " ", ""))

		svc, err := NewService(&cfg, s.log, metricName)
		require.NoError(err)

		svc.Start()

		orderCreatedAt := time.Date(2023, time.June, 10, 13, 0, 0, 0, time.UTC)
		msg := shopv1.Order{
			Id:        "111",
			CreatedAt: timestamppb.New(orderCreatedAt),
		}

		pbData, err := proto.Marshal(&msg)
		require.NoError(err)

		r := &kgo.Record{
			Key:       []byte(msg.Id),
			Value:     pbData,
			Topic:     testTopicName,
			Timestamp: orderCreatedAt,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record
		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := svc.Deserializer.DeserializeRecord(record)
		require.NotNil(dr)
		assert.Equal(messageEncodingProtobuf, dr.Value.Payload.RecognizedEncoding)
		assert.IsType(map[string]interface{}{}, dr.Value.Object)

		rOrder := shopv1.Order{}
		err = protojson.Unmarshal(dr.Value.Payload.Payload, &rOrder)
		assert.NoError(err)
		assert.Equal("111", rOrder.Id)
		assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), rOrder.GetCreatedAt().GetSeconds())
	})

	t.Run("schema protobuf", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("deserializer_schema_protobuf")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		registryURL := "http://" + s.registryAddress

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(registryURL))
		require.NoError(err)

		protoFilePath := "testdata/proto/shop/v1/order.proto"
		protoFile, err := os.ReadFile(protoFilePath)
		require.NoError(err)

		ss, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ss)

		// test
		cfg := s.createBaseConfig()
		cfg.Kafka.Protobuf.Enabled = true
		cfg.Kafka.Protobuf.SchemaRegistry.Enabled = true
		cfg.Kafka.Schema.Enabled = true
		cfg.Kafka.Schema.URLs = []string{registryURL}

		metricName := testutil.MetricNameForTest(strings.ReplaceAll("deserializer", " ", ""))

		svc, err := NewService(&cfg, s.log, metricName)
		require.NoError(err)

		svc.Start()

		// Set up Serde
		var serde sr.Serde
		serde.Register(
			ss.ID,
			&shopv1.Order{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*shopv1.Order))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*shopv1.Order))
			}),
			sr.Index(0),
		)

		orderCreatedAt := time.Date(2023, time.July, 11, 13, 0, 0, 0, time.UTC)
		msg := shopv1.Order{
			Id:        "222",
			CreatedAt: timestamppb.New(orderCreatedAt),
		}

		msgData, err := serde.Encode(&msg)

		r := &kgo.Record{
			Key:       []byte(msg.Id),
			Value:     msgData,
			Topic:     testTopicName,
			Timestamp: orderCreatedAt,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record

		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := svc.Deserializer.DeserializeRecord(record)
		require.NotNil(dr)
		assert.Equal(messageEncodingProtobuf, dr.Value.Payload.RecognizedEncoding)
		assert.IsType(map[string]interface{}{}, dr.Value.Object)

		rOrder := shopv1.Order{}
		err = protojson.Unmarshal(dr.Value.Payload.Payload, &rOrder)
		assert.NoError(err)
		assert.Equal("222", rOrder.Id)
		assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), rOrder.GetCreatedAt().GetSeconds())
	})
}

func runRedpandaForKafkaTests(ctx context.Context, exposedKafkaPort, schemaRegistryPort int) (testcontainers.Container, error) {
	kafkaPort := strconv.FormatInt(int64(exposedKafkaPort), 10)
	registryPort := strconv.FormatInt(int64(schemaRegistryPort), 10)

	req := testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Name:     "local-redpanda",
			Hostname: "redpanda",
			Image:    "docker.redpanda.com/redpandadata/redpanda:v23.1.8",
			ExposedPorts: []string{
				kafkaPort,
				registryPort,
			},
			Cmd: []string{
				"redpanda start",
				"--smp 1",
				"--overprovisioned",
				fmt.Sprintf("--kafka-addr 0.0.0.0:%s", kafkaPort),
				fmt.Sprintf("--advertise-kafka-addr localhost:%s", kafkaPort),
				fmt.Sprintf("--schema-registry-addr 0.0.0.0:%s", registryPort),
			},
			HostConfigModifier: func(hostConfig *container.HostConfig) {
				hostConfig.PortBindings = nat.PortMap{
					nat.Port(kafkaPort + "/tcp"): []nat.PortBinding{
						{
							HostIP:   "",
							HostPort: strconv.FormatInt(int64(nat.Port(kafkaPort+"/tcp").Int()), 10),
						},
					},
					nat.Port(registryPort + "/tcp"): []nat.PortBinding{
						{
							HostIP:   "",
							HostPort: strconv.FormatInt(int64(nat.Port(registryPort+"/tcp").Int()), 10),
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
