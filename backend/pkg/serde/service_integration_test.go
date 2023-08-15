// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package serde

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"testing"
	"time"

	"github.com/docker/go-connections/nat"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/redpanda"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/redpanda-data/console/backend/pkg/config"
	ms "github.com/redpanda-data/console/backend/pkg/msgpack"
	protoPkg "github.com/redpanda-data/console/backend/pkg/proto"
	"github.com/redpanda-data/console/backend/pkg/schema"
	shopv1 "github.com/redpanda-data/console/backend/pkg/serde/testdata/proto/gen/shop/v1"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

type SerdeIntegrationTestSuite struct {
	suite.Suite

	redpandaContainer testcontainers.Container

	kafkaClient      *kgo.Client
	kafkaAdminClient *kadm.Client

	seedBroker      string
	registryAddress string
	log             *zap.Logger
}

func TestSuite(t *testing.T) {
	suite.Run(t, &SerdeIntegrationTestSuite{})
}

func (s *SerdeIntegrationTestSuite) createBaseConfig() config.Config {
	cfg := config.Config{}
	cfg.SetDefaults()
	cfg.MetricsNamespace = testutil.MetricNameForTest("serde")
	cfg.Kafka.Brokers = []string{s.seedBroker}
	cfg.Kafka.Protobuf.Enabled = true
	cfg.Kafka.Protobuf.SchemaRegistry.Enabled = true
	cfg.Kafka.Schema.Enabled = true
	cfg.Kafka.Schema.URLs = []string{"http://" + s.registryAddress}
	cfg.Kafka.MessagePack.Enabled = false

	return cfg
}

func (s *SerdeIntegrationTestSuite) consumerClientForTopic(topicName string) *kgo.Client {
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

func withImage(image string) testcontainers.CustomizeRequestOption {
	return func(req *testcontainers.GenericContainerRequest) {
		req.Image = image
	}
}

func (s *SerdeIntegrationTestSuite) SetupSuite() {
	t := s.T()
	require := require.New(t)

	ctx := context.Background()

	redpandaContainer, err := redpanda.RunContainer(ctx, withImage("redpandadata/redpanda:v23.1.13"))
	require.NoError(err)

	s.redpandaContainer = redpandaContainer

	seedBroker, err := redpandaContainer.KafkaSeedBroker(ctx)
	require.NoError(err)

	s.seedBroker = seedBroker
	s.kafkaClient, s.kafkaAdminClient = testutil.CreateClients(t, []string{seedBroker})

	registryAddr, err := getMappedHostPort(ctx, redpandaContainer, nat.Port("8081/tcp"))
	require.NoError(err)
	s.registryAddress = registryAddr

	logCfg := zap.NewDevelopmentConfig()
	logCfg.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
	log, err := logCfg.Build()
	require.NoError(err)

	s.log = log
}

func (s *SerdeIntegrationTestSuite) TearDownSuite() {
	t := s.T()
	assert := require.New(t)

	assert.NoError(s.redpandaContainer.Terminate(context.Background()))
}

func (s *SerdeIntegrationTestSuite) TestDeserializeRecord() {
	t := s.T()

	require := require.New(t)
	assert := assert.New(t)

	ctx := context.Background()

	t.Run("plain JSON", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("serde_plain_json")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)
		require.NoError(err)

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

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 3*time.Second)
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

		dr := serdeSvc.DeserializeRecord(record, DeserializationOptions{})
		require.NotNil(dr)

		// check value
		assert.Equal(payloadEncodingJSON, dr.Value.Encoding)
		assert.Equal(false, dr.Value.IsPayloadNull)
		assert.Equal(false, dr.Value.IsPayloadTooLarge)
		assert.Equal(serializedOrder, dr.Value.OriginalPayload)
		assert.Equal(len(serializedOrder), dr.Value.PayloadSizeBytes)
		assert.Empty(dr.Value.SchemaID)

		// value troubleshooting
		require.Len(dr.Value.Troubleshooting, 1)
		assert.Equal(string(payloadEncodingNone), dr.Value.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Value.Troubleshooting[0].Message)

		assert.IsType(map[string]any{}, dr.Value.ParsedPayload)

		obj, ok := (dr.Value.ParsedPayload).(map[string]any)
		require.Truef(ok, "parsed payload is not of type map[string]any")
		assert.Equal("123", obj["ID"])

		// check key
		assert.Equal(payloadEncodingText, dr.Key.Encoding)
		assert.Equal(false, dr.Key.IsPayloadNull)
		assert.Equal(false, dr.Key.IsPayloadTooLarge)
		assert.Equal([]byte(order.ID), dr.Key.OriginalPayload)
		assert.Equal(len([]byte(order.ID)), dr.Key.PayloadSizeBytes)
		keyObj, ok := (dr.Key.ParsedPayload).([]byte)
		require.Truef(ok, "parsed payload is not of type []byte")
		assert.Equal("123", string(keyObj))
		assert.Empty(dr.Key.SchemaID)

		// key troubleshooting
		require.Len(dr.Key.Troubleshooting, 10)
		assert.Equal(string(payloadEncodingNone), dr.Key.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Key.Troubleshooting[0].Message)
		assert.Equal(string(payloadEncodingJSON), dr.Key.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Key.Troubleshooting[1].Message)
		assert.Equal(string(payloadEncodingJSON), dr.Key.Troubleshooting[2].SerdeName)
		assert.Equal("payload size is < 5 for json schema", dr.Key.Troubleshooting[2].Message)
		assert.Equal(string(payloadEncodingXML), dr.Key.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Key.Troubleshooting[3].Message)
		assert.Equal(string(payloadEncodingAvro), dr.Key.Troubleshooting[4].SerdeName)
		assert.Equal("payload size is < 5", dr.Key.Troubleshooting[4].Message)
		assert.Equal(string(payloadEncodingProtobuf), dr.Key.Troubleshooting[5].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype found for the given topic 'test.redpanda.console.serde_plain_json'. Check your configured protobuf mappings", dr.Key.Troubleshooting[5].Message)
		assert.Equal(string(payloadEncodingProtobuf), dr.Key.Troubleshooting[6].SerdeName)
		assert.Equal("payload size is < 5", dr.Key.Troubleshooting[6].Message)
		assert.Equal(string(payloadEncodingMsgPack), dr.Key.Troubleshooting[7].SerdeName)
		assert.Equal("message pack encoding not configured for topic: test.redpanda.console.serde_plain_json", dr.Key.Troubleshooting[7].Message)
		assert.Equal(string(payloadEncodingSmile), dr.Key.Troubleshooting[8].SerdeName)
		assert.Equal("first bytes indicate this it not valid Smile format", dr.Key.Troubleshooting[8].Message)
		assert.Equal(string(payloadEncodingUtf8WithControlChars), dr.Key.Troubleshooting[9].SerdeName)
		assert.Equal("payload does not contain UTF8 control characters", dr.Key.Troubleshooting[9].Message)
	})

	t.Run("plain protobuf", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("serde_plain_protobuf")
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

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)
		require.NoError(err)

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

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 3*time.Second)
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

		dr := serdeSvc.DeserializeRecord(record, DeserializationOptions{})
		require.NotNil(dr)

		// check value
		assert.Equal(payloadEncodingProtobuf, dr.Value.Encoding)
		assert.Equal(false, dr.Value.IsPayloadNull)
		assert.Equal(false, dr.Value.IsPayloadTooLarge)
		assert.Equal(pbData, dr.Value.OriginalPayload)
		assert.Equal(len(pbData), dr.Value.PayloadSizeBytes)
		assert.Empty(dr.Value.SchemaID)

		ts, _ := json.Marshal(dr.Value.Troubleshooting)
		fmt.Println("value ts:")
		fmt.Println(string(ts))

		// value troubleshooting
		require.Len(dr.Value.Troubleshooting, 5)
		assert.Equal(string(payloadEncodingNone), dr.Value.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Value.Troubleshooting[0].Message)
		assert.Equal(string(payloadEncodingJSON), dr.Value.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Value.Troubleshooting[1].Message)
		assert.Equal(string(payloadEncodingJSON), dr.Value.Troubleshooting[2].SerdeName)
		assert.Equal("incorrect magic byte for json schema", dr.Value.Troubleshooting[2].Message)
		assert.Equal(string(payloadEncodingXML), dr.Value.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Value.Troubleshooting[3].Message)
		assert.Equal(string(payloadEncodingAvro), dr.Value.Troubleshooting[4].SerdeName)
		assert.Equal("incorrect magic byte", dr.Value.Troubleshooting[4].Message)

		rOrder := shopv1.Order{}
		valueBytes, ok := dr.Value.ParsedPayload.([]byte)
		assert.True(ok)
		err = protojson.Unmarshal(valueBytes, &rOrder)
		require.NoError(err)
		assert.Equal("111", rOrder.Id)
		assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), rOrder.GetCreatedAt().GetSeconds())

		// check key
		assert.Equal(payloadEncodingText, dr.Key.Encoding)
		assert.Equal(false, dr.Key.IsPayloadNull)
		assert.Equal(false, dr.Key.IsPayloadTooLarge)
		assert.Equal([]byte(msg.Id), dr.Key.OriginalPayload)
		assert.Equal(len([]byte(msg.Id)), dr.Key.PayloadSizeBytes)
		keyObj, ok := (dr.Key.ParsedPayload).([]byte)
		require.Truef(ok, "parsed payload is not of type []byte")
		assert.Equal("111", string(keyObj))
		assert.Empty(dr.Key.SchemaID)

		// key troubleshooting
		require.Len(dr.Key.Troubleshooting, 10)
		assert.Equal(string(payloadEncodingNone), dr.Key.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Key.Troubleshooting[0].Message)
		assert.Equal(string(payloadEncodingJSON), dr.Key.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Key.Troubleshooting[1].Message)
		assert.Equal(string(payloadEncodingJSON), dr.Key.Troubleshooting[2].SerdeName)
		assert.Equal("payload size is < 5 for json schema", dr.Key.Troubleshooting[2].Message)
		assert.Equal(string(payloadEncodingXML), dr.Key.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Key.Troubleshooting[3].Message)
		assert.Equal(string(payloadEncodingAvro), dr.Key.Troubleshooting[4].SerdeName)
		assert.Equal("payload size is < 5", dr.Key.Troubleshooting[4].Message)
		assert.Equal(string(payloadEncodingProtobuf), dr.Key.Troubleshooting[5].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype mapping found for the record key of topic 'test.redpanda.console.serde_plain_protobuf'", dr.Key.Troubleshooting[5].Message)
		assert.Equal(string(payloadEncodingProtobuf), dr.Key.Troubleshooting[6].SerdeName)
		assert.Equal("payload size is < 5", dr.Key.Troubleshooting[6].Message)
		assert.Equal(string(payloadEncodingMsgPack), dr.Key.Troubleshooting[7].SerdeName)
		assert.Equal("message pack encoding not configured for topic: test.redpanda.console.serde_plain_protobuf", dr.Key.Troubleshooting[7].Message)
		assert.Equal(string(payloadEncodingSmile), dr.Key.Troubleshooting[8].SerdeName)
		assert.Equal("first bytes indicate this it not valid Smile format", dr.Key.Troubleshooting[8].Message)
		assert.Equal(string(payloadEncodingUtf8WithControlChars), dr.Key.Troubleshooting[9].SerdeName)
		assert.Equal("payload does not contain UTF8 control characters", dr.Key.Troubleshooting[9].Message)
	})
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
