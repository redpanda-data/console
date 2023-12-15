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
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang/mock/gomock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kfake"
	"github.com/twmb/franz-go/pkg/kmsg"
	"github.com/twmb/franz-go/pkg/sr"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/kafka"
	"github.com/redpanda-data/console/backend/pkg/kafka/mocks"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

func (s *ConsoleIntegrationTestSuite) TestListMessages() {
	ctx := context.Background()
	t := s.T()
	assert := assert.New(t)
	require := require.New(t)

	logCfg := zap.NewDevelopmentConfig()
	logCfg.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
	log, err := logCfg.Build()
	require.NoError(err)

	testTopicName := testutil.TopicNameForTest("list_messages")

	testTopicNameProto := testutil.TopicNameForTest("list_messages_proto")

	testutil.CreateTestData(t, ctx, s.kafkaClient, s.kafkaAdminClient, testTopicName)

	_, err = s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicNameProto)
	require.NoError(err)

	ssIDs := testutil.ProduceOrdersWithSchemas(t, ctx, s.kafkaClient, s.kafkaSRClient, testTopicNameProto)
	require.Len(ssIDs, 2)

	t.Cleanup(func() {
		_, err = s.kafkaSRClient.DeleteSubject(ctx, testTopicNameProto+"-value", sr.SoftDelete)
		assert.NoError(err)

		_, err = s.kafkaSRClient.DeleteSubject(ctx, testTopicNameProto+"-value", sr.HardDelete)
		assert.NoError(err)

		s.kafkaAdminClient.DeleteTopics(ctx, testTopicName, testTopicNameProto)
	})

	t.Run("empty topic", func(t *testing.T) {
		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		testTopicName := testutil.TopicNameForTest("list_messages_empty_topic")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		timer1 := time.NewTimer(30 * time.Millisecond)
		<-timer1.C

		defer func() {
			s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
		}()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		mockProgress.EXPECT().OnPhase("Get Partitions")
		mockProgress.EXPECT().OnPhase("Get Watermarks and calculate consuming requests")
		mockProgress.EXPECT().OnComplete(gomock.Any(), false)

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker, s.registryAddr)

		ctx, cancel := context.WithTimeout(ctx, 1*time.Minute)
		defer cancel()

		input := ListMessageRequest{
			TopicName:    testTopicName,
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

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker, s.registryAddr)

		input := ListMessageRequest{
			TopicName:    testTopicName,
			PartitionID:  -1,
			StartOffset:  -2,
			MessageCount: 100,
		}

		ctx, cancel := context.WithTimeout(ctx, 1*time.Minute)
		defer cancel()

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
		mockProgress.EXPECT().OnMessage(MatchesOrder("10")).Times(1)
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).Times(1)
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker, s.registryAddr)

		input := ListMessageRequest{
			TopicName:    testTopicName,
			PartitionID:  -1,
			StartOffset:  10,
			MessageCount: 1,
		}

		ctx, cancel := context.WithTimeout(ctx, 1*time.Minute)
		defer cancel()

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
		mockProgress.EXPECT().OnMessage(MatchesOrder("10")).Times(1)
		mockProgress.EXPECT().OnMessage(MatchesOrder("11")).Times(1)
		mockProgress.EXPECT().OnMessage(MatchesOrder("12")).Times(1)
		mockProgress.EXPECT().OnMessage(MatchesOrder("13")).Times(1)
		mockProgress.EXPECT().OnMessage(MatchesOrder("14")).Times(1)
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).Times(5)
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker, s.registryAddr)

		input := ListMessageRequest{
			TopicName:    testTopicName,
			PartitionID:  -1,
			StartOffset:  10,
			MessageCount: 5,
		}

		ctx, cancel := context.WithTimeout(ctx, 1*time.Minute)
		defer cancel()

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
		mockProgress.EXPECT().OnMessage(MatchesOrder("19")).Times(1)
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).Times(1)
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker, s.registryAddr)

		input := ListMessageRequest{
			TopicName:      testTopicName,
			PartitionID:    -1,
			MessageCount:   5,
			StartTimestamp: time.Date(2010, time.November, 11, 13, 0, 0, 0, time.UTC).UnixMilli(),
			StartOffset:    StartOffsetTimestamp,
		}

		ctx, cancel := context.WithTimeout(ctx, 1*time.Minute)
		defer cancel()

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
		mockProgress.EXPECT().OnMessage(MatchesOrder("11")).Times(1)
		mockProgress.EXPECT().OnMessage(MatchesOrder("12")).Times(1)
		mockProgress.EXPECT().OnMessage(MatchesOrder("13")).Times(1)
		mockProgress.EXPECT().OnMessage(MatchesOrder("14")).Times(1)
		mockProgress.EXPECT().OnMessage(MatchesOrder("15")).Times(1)
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).Times(5)
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker, s.registryAddr)

		input := ListMessageRequest{
			TopicName:      testTopicName,
			PartitionID:    -1,
			MessageCount:   5,
			StartTimestamp: time.Date(2010, time.November, 10, 13, 10, 30, 0, time.UTC).UnixMilli(),
			StartOffset:    StartOffsetTimestamp,
		}

		ctx, cancel := context.WithTimeout(ctx, 1*time.Minute)
		defer cancel()

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.NoError(err)
	})

	t.Run("unknown topic", func(t *testing.T) {
		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		mockProgress.EXPECT().OnPhase("Get Partitions")

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker, s.registryAddr)

		input := ListMessageRequest{
			TopicName:    "console_list_messages_topic_test_unknown_topic",
			PartitionID:  -1,
			StartOffset:  -2,
			MessageCount: 100,
		}

		ctx, cancel := context.WithTimeout(ctx, 1*time.Minute)
		defer cancel()

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

		fakeClient, fakeAdminClient := testutil.CreateClients(t, fakeCluster.ListenAddrs())

		testutil.CreateTestData(t, ctx, fakeClient, fakeAdminClient, testTopicName)

		svc := createNewTestService(t, log, t.Name(), fakeCluster.ListenAddrs()[0], "")

		var int64Type int64

		mockProgress.EXPECT().OnPhase("Get Partitions")
		mockProgress.EXPECT().OnPhase("Get Watermarks and calculate consuming requests")
		mockProgress.EXPECT().OnPhase("Consuming messages")
		mockProgress.EXPECT().OnMessage(MatchesOrder("10")).Times(1)
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

				require.Len(v.Topics, 1)
				assert.Equal(testTopicName, *(v.Topics[0].Topic))

				return nil, nil, false
			case *kmsg.ListOffsetsRequest:
				loReq, ok := req.(*kmsg.ListOffsetsRequest)
				assert.True(ok, "request is not a list offset request: %+T", req)

				require.Len(loReq.Topics, 1)
				assert.Equal(testTopicName, loReq.Topics[0].Topic)

				require.Len(loReq.Topics[0].Partitions, 1)
				assert.Equal(int32(1), loReq.Topics[0].Partitions[0].MaxNumOffsets)

				return nil, nil, false
			case *kmsg.FetchRequest:
				fetchReq, ok := req.(*kmsg.FetchRequest)
				assert.True(ok, "request is not a list offset request: %+T", req)

				require.Len(fetchReq.Topics, 1)
				assert.Equal(testTopicName, fetchReq.Topics[0].Topic)

				if atomic.LoadInt32(&fetchCalls) == 0 {
					atomic.StoreInt32(&fetchCalls, 1)

					require.Len(fetchReq.Topics[0].Partitions, 1)
					assert.Equal(int64(10), fetchReq.Topics[0].Partitions[0].FetchOffset)
				} else if atomic.LoadInt32(&fetchCalls) == 1 {
					atomic.StoreInt32(&fetchCalls, 2)

					require.Len(fetchReq.Topics[0].Partitions, 1)
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

		ctx, cancel := context.WithTimeout(ctx, 1*time.Minute)
		defer cancel()

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

		fakeClient, fakeAdminClient := testutil.CreateClients(t, fakeCluster.ListenAddrs())

		testutil.CreateTestData(t, ctx, fakeClient, fakeAdminClient, testTopicName)

		svc := createNewTestService(t, log, t.Name(), fakeCluster.ListenAddrs()[0], "")

		mockProgress.EXPECT().OnPhase("Get Partitions")

		fakeCluster.Control(func(req kmsg.Request) (kmsg.Response, error, bool) {
			fakeCluster.KeepControl()

			switch v := req.(type) {
			case *kmsg.ApiVersionsRequest:
				return nil, nil, false
			case *kmsg.MetadataRequest:
				require.Len(v.Topics, 1)
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

		ctx, cancel := context.WithTimeout(ctx, 1*time.Minute)
		defer cancel()

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

		fakeClient, fakeAdminClient := testutil.CreateClients(t, fakeCluster.ListenAddrs())

		testutil.CreateTestData(t, ctx, fakeClient, fakeAdminClient, testTopicName)

		svc := createNewTestService(t, log, t.Name(), fakeCluster.ListenAddrs()[0], "")

		var int64Type int64

		mockProgress.EXPECT().OnPhase("Get Partitions")
		mockProgress.EXPECT().OnPhase("Get Watermarks and calculate consuming requests")
		mockProgress.EXPECT().OnPhase("Consuming messages")
		mockProgress.EXPECT().OnMessage(MatchesOrder("16")).Times(1)
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).Times(1)
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		fakeCluster.Control(func(req kmsg.Request) (kmsg.Response, error, bool) {
			fakeCluster.KeepControl()

			switch v := req.(type) {
			case *kmsg.ApiVersionsRequest:
				return nil, nil, false
			case *kmsg.MetadataRequest:
				require.Len(v.Topics, 1)
				assert.Equal(testTopicName, *(v.Topics[0].Topic))

				return nil, nil, false

			case *kmsg.ListOffsetsRequest:
				loReq, ok := req.(*kmsg.ListOffsetsRequest)
				assert.True(ok, "request is not a list offset request: %+T", req)

				require.Len(loReq.Topics, 1)
				assert.Equal(testTopicName, loReq.Topics[0].Topic)

				require.Len(loReq.Topics[0].Partitions, 1)
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

		ctx, cancel := context.WithTimeout(ctx, 1*time.Minute)
		defer cancel()

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.NoError(err)
	})

	t.Run("messages with filter", func(t *testing.T) {
		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		var int64Type int64

		orderMatcher := MatchesJSON(map[string]map[string]any{
			"1":  {"ID": "1"},
			"10": {"ID": "10"},
			"11": {"ID": "11"},
			"12": {"ID": "12"},
			"13": {"ID": "13"},
			"14": {"ID": "14"},
			"15": {"ID": "15"},
			"16": {"ID": "16"},
			"17": {"ID": "17"},
			"18": {"ID": "18"},
			"19": {"ID": "19"},
		})

		mockProgress.EXPECT().OnPhase("Get Partitions")
		mockProgress.EXPECT().OnPhase("Get Watermarks and calculate consuming requests")
		mockProgress.EXPECT().OnPhase("Consuming messages")
		mockProgress.EXPECT().OnMessage(orderMatcher).Times(11)
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).AnyTimes()
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker, s.registryAddr)

		code := `return value.ID.startsWith('1')`

		input := ListMessageRequest{
			TopicName:             testTopicName,
			PartitionID:           -1,
			StartOffset:           -2,
			MessageCount:          100,
			FilterInterpreterCode: code,
		}

		ctx, cancel := context.WithTimeout(ctx, 1*time.Minute)
		defer cancel()

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.NoError(err)
	})

	t.Run("messages with key filter", func(t *testing.T) {
		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		var int64Type int64
		orderMatcher := MatchesJSON(map[string]map[string]any{
			"2":  {"ID": "2"},
			"3":  {"ID": "3"},
			"12": {"ID": "12"},
			"13": {"ID": "13"},
		})

		mockProgress.EXPECT().OnPhase("Get Partitions")
		mockProgress.EXPECT().OnPhase("Get Watermarks and calculate consuming requests")
		mockProgress.EXPECT().OnPhase("Consuming messages")
		mockProgress.EXPECT().OnMessage(orderMatcher).Times(4)
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).AnyTimes()
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker, s.registryAddr)

		code := `let keyStr = String.fromCharCode.apply(null, key)
				return keyStr.endsWith('2') || keyStr.endsWith('3')`

		input := ListMessageRequest{
			TopicName:             testTopicName,
			PartitionID:           -1,
			StartOffset:           -2,
			MessageCount:          100,
			FilterInterpreterCode: code,
		}

		ctx, cancel := context.WithTimeout(ctx, 1*time.Minute)
		defer cancel()

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.NoError(err)
	})

	t.Run("messages with schema ID", func(t *testing.T) {
		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		var int64Type int64
		orderMatcher := MatchesJSON(map[string]map[string]any{
			"0": {"id": "0"},
			"1": {"id": "1"},
			"2": {"id": "2"},
			"3": {"id": "3"},
			"4": {"id": "4"},
			"5": {"id": "5"},
			"6": {"id": "6"},
			"7": {"id": "7"},
			"8": {"id": "8"},
			"9": {"id": "9"},
		})

		mockProgress.EXPECT().OnPhase("Get Partitions")
		mockProgress.EXPECT().OnPhase("Get Watermarks and calculate consuming requests")
		mockProgress.EXPECT().OnPhase("Consuming messages")
		mockProgress.EXPECT().OnMessage(orderMatcher).Times(10)
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).AnyTimes()
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker, s.registryAddr)

		code := `return valueSchemaID == ` + strconv.Itoa(ssIDs[0])

		input := ListMessageRequest{
			TopicName:             testTopicNameProto,
			PartitionID:           -1,
			StartOffset:           -2,
			MessageCount:          100,
			FilterInterpreterCode: code,
		}

		ctx, cancel := context.WithTimeout(ctx, 1*time.Minute)
		defer cancel()

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.NoError(err)
	})

	t.Run("messages with schema ID 2", func(t *testing.T) {
		mockCtrl := gomock.NewController(t)
		defer mockCtrl.Finish()

		mockProgress := mocks.NewMockIListMessagesProgress(mockCtrl)

		var int64Type int64
		// Go JSON unmarshals numeric values as float64
		orderMatcher := MatchesJSON(map[string]map[string]any{
			"20": {"id": "20", "version": float64(1), "name": "2"},
			"21": {"id": "21", "version": float64(1), "name": "4"},
			"22": {"id": "22", "version": float64(1), "name": "8"},
			"23": {"id": "23", "version": float64(1), "name": "16"},
			"24": {"id": "24", "version": float64(1), "name": "32"},
			"25": {"id": "25", "version": float64(1), "name": "64"},
			"26": {"id": "26", "version": float64(1), "name": "128"},
			"27": {"id": "27", "version": float64(1), "name": "256"},
			"28": {"id": "28", "version": float64(1), "name": "512"},
			"29": {"id": "29", "version": float64(1), "name": "1024"},
		})

		mockProgress.EXPECT().OnPhase("Get Partitions")
		mockProgress.EXPECT().OnPhase("Get Watermarks and calculate consuming requests")
		mockProgress.EXPECT().OnPhase("Consuming messages")
		mockProgress.EXPECT().OnMessageConsumed(gomock.AssignableToTypeOf(int64Type)).AnyTimes()
		mockProgress.EXPECT().OnMessage(orderMatcher).Times(10)
		mockProgress.EXPECT().OnComplete(gomock.AssignableToTypeOf(int64Type), false)

		svc := createNewTestService(t, log, t.Name(), s.testSeedBroker, s.registryAddr)

		code := `return valueSchemaID == ` + strconv.Itoa(ssIDs[1])

		input := ListMessageRequest{
			TopicName:             testTopicNameProto,
			PartitionID:           -1,
			StartOffset:           -2,
			MessageCount:          100,
			FilterInterpreterCode: code,
		}

		ctx, cancel := context.WithTimeout(ctx, 1*time.Minute)
		defer cancel()

		err = svc.ListMessages(ctx, input, mockProgress)
		assert.NoError(err)
	})
}

func createNewTestService(t *testing.T, log *zap.Logger,
	testName string, seedBrokers string, registryAddr string,
) Servicer {
	metricName := testutil.MetricNameForTest(strings.ReplaceAll(testName, " ", ""))

	cfg := config.Config{}
	cfg.SetDefaults()
	cfg.MetricsNamespace = metricName
	cfg.Kafka.Brokers = []string{seedBrokers}

	if registryAddr != "" {
		cfg.Kafka.Protobuf.Enabled = true
		cfg.Kafka.Protobuf.SchemaRegistry.Enabled = true
		cfg.Kafka.Schema.Enabled = true
		cfg.Kafka.Schema.URLs = []string{registryAddr}
	}

	svc, err := NewService(&cfg, log, nil, nil)
	require.NoError(t, err)

	err = svc.Start()
	require.NoError(t, err)

	return svc
}

// OrderMatcher can be used in expect functions to assert on Order ID
type OrderMatcher struct {
	expectedID string
	actualID   string
	err        string
}

// Matches implements the Matcher interface for OrderMatcher
func (o *OrderMatcher) Matches(x interface{}) bool {
	if m, ok := x.(*kafka.TopicMessage); ok {
		order := testutil.Order{}
		err := json.Unmarshal(m.Value.NormalizedPayload, &order)
		if err != nil {
			o.err = fmt.Sprintf("marshal error: %s", err.Error())
			return false
		}

		o.actualID = order.ID

		return order.ID == o.expectedID
	}

	o.err = "value is not a TopicMessage"
	return false
}

// String implements the Stringer interface for OrderMatcher
func (o *OrderMatcher) String() string {
	return fmt.Sprintf("has order ID %s expected order ID %s. err: %s", o.actualID, o.expectedID, o.err)
}

// MatchesOrder creates the Matcher
func MatchesOrder(id string) gomock.Matcher {
	return &OrderMatcher{expectedID: id}
}

// GenericMatcher can be used in expect functions to assert on JSON.
type GenericMatcher struct {
	expected  map[string]map[string]any
	err       string
	actualKey string
	failedVal string
	m         sync.Mutex
}

// Matches implements the Matcher interface for OrderMatcher
func (o *GenericMatcher) Matches(x interface{}) bool {
	o.err = ""
	o.actualKey = ""
	o.failedVal = ""

	if m, ok := x.(*kafka.TopicMessage); ok {
		obj := map[string]any{}

		err := json.Unmarshal(m.Value.NormalizedPayload, &obj)
		if err != nil {
			o.err = fmt.Sprintf("unmarshal error: %s", err.Error())
			return false
		}

		key := string(m.Key.NormalizedPayload)
		o.actualKey = key

		o.m.Lock()
		defer o.m.Unlock()

		expectedData, exists := o.expected[key]
		if !exists {
			return false
		}
		equal := true

		for ek, ev := range expectedData {
			ev := ev
			if ev != obj[ek] {
				equal = false
				o.failedVal = ek
				break
			}
		}

		if !equal {
			return false
		}

		delete(o.expected, key)

		o.err = ""
		o.actualKey = ""
		o.failedVal = ""

		return true
	}

	o.err = "value is not a TopicMessage"
	return false
}

// String implements the Stringer interface for OrderMatcher
func (o *GenericMatcher) String() string {
	if o.err != "" {
		return fmt.Sprintf("error: %s", o.err)
	}

	if o.failedVal != "" {
		return fmt.Sprintf("got key %s with unequal value at key %s. expected: %+v", o.actualKey, o.failedVal, o.expected[o.actualKey][o.failedVal])
	} else if o.actualKey != "" {
		return fmt.Sprintf("missing key %s", o.actualKey)
	} else if len(o.expected) > 0 {
		return fmt.Sprintf("missing expected matches %+v", o.expected)
	}

	return ""
}

// MatchesOrder creates the Matcher
func MatchesJSON(expected map[string]map[string]any) gomock.Matcher {
	return &GenericMatcher{expected: expected}
}
