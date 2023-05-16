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
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang/mock/gomock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go/modules/redpanda"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kfake"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
	"github.com/twmb/franz-go/pkg/kversion"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/kafka"
	"github.com/redpanda-data/console/backend/pkg/kafka/mocks"
)

type ListMessagesTestSuite struct {
	suite.Suite

	redpandaContainer *redpanda.Container

	kafkaClient      *kgo.Client
	kafkaAdminClient *kadm.Client

	testSeedBroker string
	testTopicName  string
}

func TestSuite(t *testing.T) {
	suite.Run(t, &ListMessagesTestSuite{})
}

func (s *ListMessagesTestSuite) SetupSuite() {
	fmt.Println("!!! SetupSuite")
	t := s.T()
	require := require.New(t)

	ctx := context.Background()
	container, err := redpanda.RunContainer(ctx)
	require.NoError(err)
	s.redpandaContainer = container

	seedBroker, err := container.KafkaSeedBroker(ctx)
	require.NoError(err)

	s.testSeedBroker = seedBroker
	s.testTopicName = topicNameForTest("list_messages")

	s.kafkaClient, s.kafkaAdminClient = createTestData(t, ctx, []string{seedBroker}, s.testTopicName)
}

func (s *ListMessagesTestSuite) TearDownSuite() {
	t := s.T()
	assert := require.New(t)

	assert.NoError(s.redpandaContainer.Terminate(context.Background()))
}

func (s *ListMessagesTestSuite) TestListMessages() {
	ctx := context.Background()
	t := s.T()
	assert := assert.New(t)
	require := require.New(t)

	logCfg := zap.NewDevelopmentConfig()
	logCfg.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
	log, err := logCfg.Build()
	require.NoError(err)

	testTopicName := s.testTopicName

	t.Run("empty topic", func(t *testing.T) {
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil,
			topicNameForTest("list_messages_empty_topic"))
		require.NoError(err)

		defer func() {
			s.kafkaAdminClient.DeleteTopics(ctx, topicNameForTest("list_messages_empty_topic"))
		}()

		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		mockProgress.EXPECT().OnPhase("Get Partitions")
		mockProgress.EXPECT().OnPhase("Get Watermarks and calculate consuming requests")
		mockProgress.EXPECT().OnComplete(gomock.Any(), false)

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker)

		input := ListMessageRequest{
			TopicName:    topicNameForTest("list_messages_empty_topic"),
			PartitionID:  -1,
			StartOffset:  -2,
			MessageCount: 100,
		}

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.NoError(err)
	})

	t.Run("all messages in a topic", func(t *testing.T) {
		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		var msg *kafka.TopicMessage
		var int64Type int64

		mockProgress.EXPECT().OnPhase("Get Partitions")
		mockProgress.EXPECT().OnPhase("Get Watermarks and calculate consuming requests")
		mockProgress.EXPECT().OnPhase("Consuming messages")
		mockProgress.EXPECT().OnMessage(gomock.AssignableToTypeOf(msg)).Times(20)
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).Times(20)
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker)

		input := ListMessageRequest{
			TopicName:    testTopicName,
			PartitionID:  -1,
			StartOffset:  -2,
			MessageCount: 100,
		}

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.NoError(err)
	})

	t.Run("single messages in a topic", func(t *testing.T) {
		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		var int64Type int64

		mockProgress.EXPECT().OnPhase("Get Partitions")
		mockProgress.EXPECT().OnPhase("Get Watermarks and calculate consuming requests")
		mockProgress.EXPECT().OnPhase("Consuming messages")
		mockProgress.EXPECT().OnMessage(matchesOrder("10")).Times(1)
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).Times(1)
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker)

		input := ListMessageRequest{
			TopicName:    testTopicName,
			PartitionID:  -1,
			StartOffset:  10,
			MessageCount: 1,
		}

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.NoError(err)
	})

	t.Run("five messages in a topic", func(t *testing.T) {
		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		var int64Type int64

		mockProgress.EXPECT().OnPhase("Get Partitions")
		mockProgress.EXPECT().OnPhase("Get Watermarks and calculate consuming requests")
		mockProgress.EXPECT().OnPhase("Consuming messages")
		mockProgress.EXPECT().OnMessage(matchesOrder("10")).Times(1)
		mockProgress.EXPECT().OnMessage(matchesOrder("11")).Times(1)
		mockProgress.EXPECT().OnMessage(matchesOrder("12")).Times(1)
		mockProgress.EXPECT().OnMessage(matchesOrder("13")).Times(1)
		mockProgress.EXPECT().OnMessage(matchesOrder("14")).Times(1)
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).Times(5)
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker)

		input := ListMessageRequest{
			TopicName:    testTopicName,
			PartitionID:  -1,
			StartOffset:  10,
			MessageCount: 5,
		}

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.NoError(err)
	})

	t.Run("time stamp in future get last record", func(t *testing.T) {
		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		var int64Type int64

		mockProgress.EXPECT().OnPhase("Get Partitions")
		mockProgress.EXPECT().OnPhase("Get Watermarks and calculate consuming requests")
		mockProgress.EXPECT().OnPhase("Consuming messages")
		mockProgress.EXPECT().OnMessage(matchesOrder("19")).Times(1)
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).Times(1)
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker)

		input := ListMessageRequest{
			TopicName:      testTopicName,
			PartitionID:    -1,
			MessageCount:   5,
			StartTimestamp: time.Date(2010, time.November, 11, 13, 0, 0, 0, time.UTC).UnixMilli(),
			StartOffset:    StartOffsetTimestamp,
		}

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.NoError(err)
	})

	t.Run("time stamp in middle get 5 records", func(t *testing.T) {
		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		var int64Type int64

		mockProgress.EXPECT().OnPhase("Get Partitions")
		mockProgress.EXPECT().OnPhase("Get Watermarks and calculate consuming requests")
		mockProgress.EXPECT().OnPhase("Consuming messages")
		mockProgress.EXPECT().OnMessage(matchesOrder("11")).Times(1)
		mockProgress.EXPECT().OnMessage(matchesOrder("12")).Times(1)
		mockProgress.EXPECT().OnMessage(matchesOrder("13")).Times(1)
		mockProgress.EXPECT().OnMessage(matchesOrder("14")).Times(1)
		mockProgress.EXPECT().OnMessage(matchesOrder("15")).Times(1)
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).Times(5)
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker)

		input := ListMessageRequest{
			TopicName:      testTopicName,
			PartitionID:    -1,
			MessageCount:   5,
			StartTimestamp: time.Date(2010, time.November, 10, 13, 10, 30, 0, time.UTC).UnixMilli(),
			StartOffset:    StartOffsetTimestamp,
		}

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.NoError(err)
	})

	t.Run("unknown topic", func(t *testing.T) {
		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		mockProgress.EXPECT().OnPhase("Get Partitions")

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker)

		input := ListMessageRequest{
			TopicName:    "console_list_messages_topic_test_unknown_topic",
			PartitionID:  -1,
			StartOffset:  -2,
			MessageCount: 100,
		}

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.Error(err)
		assert.Equal("failed to get partitions: UNKNOWN_TOPIC_OR_PARTITION: This server does not host this topic-partition.",
			err.Error())
	})

	// This is essentially the same test as "single messages in a topic" test
	// but using kfake package to demonstrate a full test of how to use the package
	// to verify functionality.
	t.Run("single messages in a topic fake", func(t *testing.T) {
		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		fakeCluster, err := kfake.NewCluster(kfake.NumBrokers(1))
		require.NoError(err)

		defer fakeCluster.Close()

		// create test topic and test data in the fake redpanda cluster
		_, _ = createTestData(t, ctx, fakeCluster.ListenAddrs(), testTopicName)

		svc := createNewTestService(t, log, t.Name(), fakeCluster.ListenAddrs()[0])

		var int64Type int64

		mockProgress.EXPECT().OnPhase("Get Partitions")
		mockProgress.EXPECT().OnPhase("Get Watermarks and calculate consuming requests")
		mockProgress.EXPECT().OnPhase("Consuming messages")
		mockProgress.EXPECT().OnMessage(matchesOrder("10")).Times(1)
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).Times(1)
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		var fetchCalls int32
		mdCalls := atomic.Int32{}

		fakeCluster.Control(func(req kmsg.Request) (kmsg.Response, error, bool) {
			fakeCluster.KeepControl()

			switch v := req.(type) {
			case *kmsg.ApiVersionsRequest:
				return nil, nil, false
			case *kmsg.MetadataRequest:
				mdCalls.Add(1)

				assert.Len(v.Topics, 1)
				assert.Equal(testTopicName, *(v.Topics[0].Topic))

				return nil, nil, false
			case *kmsg.ListOffsetsRequest:
				loReq, ok := req.(*kmsg.ListOffsetsRequest)
				assert.True(ok, "request is not a list offset request: %+T", req)

				assert.Len(loReq.Topics, 1)
				assert.Equal(testTopicName, loReq.Topics[0].Topic)

				assert.Len(loReq.Topics[0].Partitions, 1)
				assert.Equal(int32(1), loReq.Topics[0].Partitions[0].MaxNumOffsets)

				return nil, nil, false
			case *kmsg.FetchRequest:
				fetchReq, ok := req.(*kmsg.FetchRequest)
				assert.True(ok, "request is not a list offset request: %+T", req)

				assert.Len(fetchReq.Topics, 1)
				assert.Equal(testTopicName, fetchReq.Topics[0].Topic)

				if atomic.LoadInt32(&fetchCalls) == 0 {
					atomic.StoreInt32(&fetchCalls, 1)

					assert.Len(fetchReq.Topics[0].Partitions, 1)
					assert.Equal(int64(10), fetchReq.Topics[0].Partitions[0].FetchOffset)
				} else if atomic.LoadInt32(&fetchCalls) == 1 {
					atomic.StoreInt32(&fetchCalls, 2)

					assert.Len(fetchReq.Topics[0].Partitions, 1)
					assert.Equal(int64(20), fetchReq.Topics[0].Partitions[0].FetchOffset)
				} else {
					assert.Fail("unexpected call to fake fetch request")
				}

				return nil, nil, false
			default:
				assert.Fail(fmt.Sprintf("unexpected call to fake kafka request %+T", v))

				return nil, nil, false
			}
		})

		input := ListMessageRequest{
			TopicName:    testTopicName,
			PartitionID:  -1,
			StartOffset:  10,
			MessageCount: 1,
		}

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.NoError(err)
	})

	t.Run("metadata topic error", func(t *testing.T) {
		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		fakeCluster, err := kfake.NewCluster(kfake.NumBrokers(1))
		require.NoError(err)

		defer fakeCluster.Close()

		// create test topic and test data in the fake redpanda cluster
		_, _ = createTestData(t, ctx, fakeCluster.ListenAddrs(), testTopicName)

		svc := createNewTestService(t, log, t.Name(), fakeCluster.ListenAddrs()[0])

		mockProgress.EXPECT().OnPhase("Get Partitions")

		fakeCluster.Control(func(req kmsg.Request) (kmsg.Response, error, bool) {
			fakeCluster.KeepControl()

			switch v := req.(type) {
			case *kmsg.ApiVersionsRequest:
				return nil, nil, false
			case *kmsg.MetadataRequest:
				assert.Len(v.Topics, 1)
				assert.Equal(testTopicName, *(v.Topics[0].Topic))

				mdRes := v.ResponseKind().(*kmsg.MetadataResponse)
				mdRes.Topics = make([]kmsg.MetadataResponseTopic, 1)
				mdRes.Topics[0] = kmsg.NewMetadataResponseTopic()
				mdRes.Topics[0].Topic = kmsg.StringPtr(testTopicName)
				mdRes.Topics[0].Partitions = make([]kmsg.MetadataResponseTopicPartition, 1)
				mdRes.Topics[0].Partitions[0].Partition = 0
				mdRes.Topics[0].Partitions[0].Leader = 0
				mdRes.Topics[0].Partitions[0].LeaderEpoch = 1
				mdRes.Topics[0].Partitions[0].Replicas = make([]int32, 1)
				mdRes.Topics[0].Partitions[0].Replicas[0] = 0
				mdRes.Topics[0].Partitions[0].ISR = make([]int32, 1)
				mdRes.Topics[0].Partitions[0].ISR[0] = 0

				mdRes.Topics[0].ErrorCode = kerr.LeaderNotAvailable.Code

				return mdRes, nil, true

			default:
				assert.Fail(fmt.Sprintf("unexpected call to fake kafka request %+T", v))

				return nil, nil, false
			}
		})

		input := ListMessageRequest{
			TopicName:    testTopicName,
			PartitionID:  -1,
			StartOffset:  15,
			MessageCount: 1,
		}

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.Error(err)
		assert.Equal("failed to get partitions: LEADER_NOT_AVAILABLE: There is no leader for this topic-partition as we are in the middle of a leadership election.", err.Error())
	})

	t.Run("list offset error", func(t *testing.T) {
		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		fakeCluster, err := kfake.NewCluster(kfake.NumBrokers(1))
		require.NoError(err)

		defer fakeCluster.Close()

		// create test topic and test data in the fake redpanda cluster
		_, _ = createTestData(t, ctx, fakeCluster.ListenAddrs(), testTopicName)

		svc := createNewTestService(t, log, t.Name(), fakeCluster.ListenAddrs()[0])

		var int64Type int64

		mockProgress.EXPECT().OnPhase("Get Partitions")
		mockProgress.EXPECT().OnPhase("Get Watermarks and calculate consuming requests")
		mockProgress.EXPECT().OnPhase("Consuming messages")
		mockProgress.EXPECT().OnMessage(matchesOrder("16")).Times(1)
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).Times(1)
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		fakeCluster.Control(func(req kmsg.Request) (kmsg.Response, error, bool) {
			fakeCluster.KeepControl()

			switch v := req.(type) {
			case *kmsg.ApiVersionsRequest:
				return nil, nil, false
			case *kmsg.MetadataRequest:
				assert.Len(v.Topics, 1)
				assert.Equal(testTopicName, *(v.Topics[0].Topic))

				return nil, nil, false

			case *kmsg.ListOffsetsRequest:
				loReq, ok := req.(*kmsg.ListOffsetsRequest)
				assert.True(ok, "request is not a list offset request: %+T", req)

				assert.Len(loReq.Topics, 1)
				assert.Equal(testTopicName, loReq.Topics[0].Topic)

				assert.Len(loReq.Topics[0].Partitions, 1)
				assert.Equal(int32(1), loReq.Topics[0].Partitions[0].MaxNumOffsets)

				loRes := v.ResponseKind().(*kmsg.ListOffsetsResponse)
				loRes.Topics = make([]kmsg.ListOffsetsResponseTopic, 1)
				loRes.Topics[0] = kmsg.NewListOffsetsResponseTopic()
				loRes.Topics[0].Topic = testTopicName
				loRes.Topics[0].Partitions = make([]kmsg.ListOffsetsResponseTopicPartition, 1)
				loRes.Topics[0].Partitions[0].Partition = 0
				loRes.Topics[0].Partitions[0].LeaderEpoch = 1
				loRes.Topics[0].Partitions[0].Timestamp = -1
				loRes.Topics[0].Partitions[0].Offset = 0

				loRes.Topics[0].Partitions[0].ErrorCode = kerr.NotLeaderForPartition.Code

				return loRes, nil, true

			default:
				assert.Fail(fmt.Sprintf("unexpected call to fake kafka request %+T", v))

				return nil, nil, false
			}
		})

		input := ListMessageRequest{
			TopicName:    testTopicName,
			PartitionID:  -1,
			StartOffset:  16,
			MessageCount: 1,
		}

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.NoError(err)
	})
}

func createNewTestService(t *testing.T, log *zap.Logger,
	testName string, seedBrokers string) *Service {
	metricName := metricNameForTest(strings.ReplaceAll(testName, " ", ""))

	cfg := config.Config{}
	cfg.SetDefaults()
	cfg.MetricsNamespace = metricName
	cfg.Kafka.Brokers = []string{seedBrokers}

	kafkaSvc, err := kafka.NewService(&cfg, log, metricName)
	assert.NoError(t, err)

	svc, err := NewService(cfg.Console, log, kafkaSvc, nil, nil)
	assert.NoError(t, err)

	return svc
}

type Order struct {
	ID string
}

type orderMatcher struct {
	expectedID string
	actualID   string
	err        string
}

func (om *orderMatcher) Matches(x interface{}) bool {
	if m, ok := x.(*kafka.TopicMessage); ok {
		order := Order{}
		err := json.Unmarshal(m.Value.Payload.Payload, &order)
		if err != nil {
			om.err = fmt.Sprintf("marshal error: %s", err.Error())
			return false
		}

		om.actualID = order.ID

		return order.ID == om.expectedID
	}

	om.err = "value is not a TopicMessage"
	return false
}

func (m *orderMatcher) String() string {
	return fmt.Sprintf("has order ID %s expected order ID %s. err: %s", m.actualID, m.expectedID, m.err)
}

func matchesOrder(id string) gomock.Matcher {
	return &orderMatcher{expectedID: id}
}

func createTestData(t *testing.T, ctx context.Context, brokers []string, testTopicName string) (*kgo.Client, *kadm.Client) {
	cfg := config.Config{}
	cfg.SetDefaults()
	cfg.MetricsNamespace = metricNameForTest("console_list_messages")
	cfg.Kafka.Brokers = brokers

	opts := []kgo.Opt{
		kgo.SeedBrokers(cfg.Kafka.Brokers...),
		kgo.MaxVersions(kversion.V2_6_0()),
		kgo.FetchMaxBytes(5 * 1000 * 1000), // 5MB
		kgo.MaxConcurrentFetches(12),
		kgo.KeepControlRecords(),
	}

	kClient, err := kgo.NewClient(opts...)
	kafkaAdmCl := kadm.NewClient(kClient)

	_, err = kafkaAdmCl.CreateTopic(ctx, 1, 1, nil, testTopicName)
	assert.NoError(t, err)

	g := new(errgroup.Group)
	g.Go(func() error {
		produceOrders(t, ctx, kClient, testTopicName)
		return nil
	})

	err = g.Wait()
	assert.NoError(t, err)

	return kClient, kafkaAdmCl
}

func produceOrders(t *testing.T, ctx context.Context, kafkaCl *kgo.Client, topic string) {
	t.Helper()

	ticker := time.NewTicker(100 * time.Millisecond)

	recordTimeStamp := time.Date(2010, time.November, 10, 13, 0, 0, 0, time.UTC)

	i := 0
	for i < 20 {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			order := Order{ID: strconv.Itoa(i)}
			serializedOrder, err := json.Marshal(order)
			require.NoError(t, err)

			r := &kgo.Record{
				Key:       []byte(order.ID),
				Value:     serializedOrder,
				Topic:     topic,
				Timestamp: recordTimeStamp,
			}
			results := kafkaCl.ProduceSync(ctx, r)
			require.NoError(t, results.FirstErr())

			i++

			recordTimeStamp = recordTimeStamp.Add(1 * time.Minute)
		}
	}
}
