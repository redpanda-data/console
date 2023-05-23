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
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kfake"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/kafka"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

type restAPIError struct {
	Status  int    `json:"statusCode"`
	Message string `json:"message"`
}

func (s *APIIntegrationTestSuite) TestHandleCreateTopic() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	logCfg := zap.NewDevelopmentConfig()
	logCfg.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
	log, err := logCfg.Build()
	require.NoError(err)

	t.Run("happy path", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		input := &createTopicRequest{
			TopicName:         testutil.TopicNameForTest("create_topic"),
			PartitionCount:    1,
			ReplicationFactor: 1,
		}

		res, body := s.apiRequest(ctx, http.MethodPost, "/api/topics", input)

		assert.Equal(200, res.StatusCode)

		topicName := testutil.TopicNameForTest("create_topic")

		defer func() {
			s.kafkaAdminClient.DeleteTopics(ctx, topicName)
		}()

		createTopicRes := console.CreateTopicResponse{}

		err := json.Unmarshal(body, &createTopicRes)
		assert.NoError(err)
		assert.Equal(topicName, createTopicRes.TopicName)
		assert.Greater(len(createTopicRes.CreateTopicResponseConfigs), 0)

		mdRes, err := s.kafkaAdminClient.Metadata(ctx, topicName)
		assert.NoError(err)
		assert.Len(mdRes.Topics, 1)

		assert.NotEmpty(mdRes.Topics[topicName])

		topic := mdRes.Topics[topicName]

		assert.Len(topic.Partitions, 1)
		assert.NotEmpty(topic.Partitions[0])
		assert.Len(topic.Partitions[0].Replicas, 1)
		assert.Empty(topic.Err)

		dtRes, err := s.kafkaAdminClient.DescribeTopicConfigs(ctx, topicName)
		assert.NoError(err)

		assert.Len(dtRes, 1)

		assert.NoError(dtRes[0].Err)
		assert.True(len(dtRes[0].Configs) > 0)
		assert.Equal(dtRes[0].Name, topicName)
	})

	t.Run("happy path multi partition", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		input := &createTopicRequest{
			TopicName:         testutil.TopicNameForTest("create_topic_multi"),
			PartitionCount:    2,
			ReplicationFactor: 1,
		}

		res, body := s.apiRequest(ctx, http.MethodPost, "/api/topics", input)

		assert.Equal(200, res.StatusCode)

		topicName := testutil.TopicNameForTest("create_topic_multi")

		defer func() {
			s.kafkaAdminClient.DeleteTopics(ctx, topicName)
		}()

		createTopicRes := console.CreateTopicResponse{}

		err := json.Unmarshal(body, &createTopicRes)
		assert.NoError(err)
		assert.Equal(topicName, createTopicRes.TopicName)
		assert.Greater(len(createTopicRes.CreateTopicResponseConfigs), 0)

		mdRes, err := s.kafkaAdminClient.Metadata(ctx, topicName)
		assert.NoError(err)
		assert.Len(mdRes.Topics, 1)

		assert.NotEmpty(mdRes.Topics[topicName])

		topic := mdRes.Topics[topicName]

		assert.Len(topic.Partitions, 2)
		assert.NotEmpty(topic.Partitions[0])
		assert.Len(topic.Partitions[0].Replicas, 1)
		assert.NotEmpty(topic.Partitions[1], 1)
		assert.Len(topic.Partitions[1].Replicas, 1)
		assert.Empty(topic.Err)

		dtRes, err := s.kafkaAdminClient.DescribeTopicConfigs(ctx, topicName)
		assert.NoError(err)

		assert.Len(dtRes, 1)

		assert.NoError(dtRes[0].Err)
		assert.Greater(len(dtRes[0].Configs), 0)
		assert.Equal(dtRes[0].Name, topicName)
	})

	t.Run("no partition", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		input := &createTopicRequest{
			TopicName:         testutil.TopicNameForTest("no_partition"),
			PartitionCount:    0,
			ReplicationFactor: 1,
		}

		res, body := s.apiRequest(ctx, http.MethodPost, "/api/topics", input)

		assert.Equal(400, res.StatusCode)

		apiErr := restAPIError{}

		err := json.Unmarshal(body, &apiErr)
		assert.NoError(err)

		assert.Equal(
			"validating the decoded object failed: you must create a topic with at least one partition",
			apiErr.Message)

		assert.Equal(400, apiErr.Status)
	})

	t.Run("no replication", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		input := &createTopicRequest{
			TopicName:         testutil.TopicNameForTest("no_replication"),
			PartitionCount:    1,
			ReplicationFactor: 0,
		}

		res, body := s.apiRequest(ctx, http.MethodPost, "/api/topics", input)

		assert.Equal(400, res.StatusCode)

		apiErr := restAPIError{}

		err := json.Unmarshal(body, &apiErr)
		assert.NoError(err)

		assert.Equal(
			"validating the decoded object failed: replication factor must be 1 or more",
			apiErr.Message)

		assert.Equal(400, apiErr.Status)
	})

	t.Run("invalid topic name", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		input := &createTopicRequest{
			TopicName:         testutil.TopicNameForTest("invalid topic name"),
			PartitionCount:    1,
			ReplicationFactor: 0,
		}

		res, body := s.apiRequest(ctx, http.MethodPost, "/api/topics", input)

		assert.Equal(400, res.StatusCode)

		apiErr := restAPIError{}

		err := json.Unmarshal(body, &apiErr)
		assert.NoError(err)

		assert.Equal(
			`validating the decoded object failed: valid characters for Kafka topics are the ASCII alphanumeric characters and '.', '_', '-'`,
			apiErr.Message)

		assert.Equal(400, apiErr.Status)
	})

	t.Run("no permission", func(t *testing.T) {

		topicName := testutil.TopicNameForTest("no_permission")

		oldHooks := s.api.Hooks
		newHooks := newAssertHooks(t, map[string]map[string]assertCallReturnValue{
			"CanCreateTopic": {
				topicName: assertCallReturnValue{BoolValue: false, Err: nil},
			},
		})

		if newHooks != nil {
			s.api.Hooks = newHooks
		}

		defer func() {
			if oldHooks != nil {
				s.api.Hooks = oldHooks
			}
		}()

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		input := &createTopicRequest{
			TopicName:         topicName,
			PartitionCount:    1,
			ReplicationFactor: 1,
		}

		res, body := s.apiRequest(ctx, http.MethodPost, "/api/topics", input)

		assert.Equal(403, res.StatusCode)

		apiErr := restAPIError{}

		err := json.Unmarshal(body, &apiErr)
		assert.NoError(err)

		assert.Equal(`You don't have permissions to create this topic.`, apiErr.Message)

		assert.Equal(403, apiErr.Status)
	})

	t.Run("create topic fail", func(t *testing.T) {
		// fake cluster
		fakeCluster, err := kfake.NewCluster(kfake.NumBrokers(1))
		assert.NoError(err)

		newConfig := s.copyConfig()

		// new kafka service
		newConfig.Kafka.Brokers = fakeCluster.ListenAddrs()
		newKafkaSvc, err := kafka.NewService(newConfig, log,
			testutil.MetricNameForTest(strings.ReplaceAll(t.Name(), " ", "")))
		assert.NoError(err)

		// new console service
		newConsoleSvc, err := console.NewService(newConfig.Console, log, newKafkaSvc, s.api.RedpandaSvc, s.api.ConnectSvc)
		assert.NoError(err)

		// save old
		oldConsoleSvc := s.api.ConsoleSvc
		oldKafkaSvc := s.api.KafkaSvc

		// switch
		s.api.KafkaSvc = newKafkaSvc
		s.api.ConsoleSvc = newConsoleSvc

		// call the fake control and expect function
		fakeCluster.Control(func(req kmsg.Request) (kmsg.Response, error, bool) {
			fakeCluster.KeepControl()

			switch v := req.(type) {
			case *kmsg.ApiVersionsRequest:
				return nil, nil, false
			case *kmsg.MetadataRequest:
				return nil, nil, false
			case *kmsg.CreateTopicsRequest:
				assert.Len(v.Topics, 1)
				assert.Equal(testutil.TopicNameForTest("create_topic_fail"), v.Topics[0].Topic)

				ctRes := v.ResponseKind().(*kmsg.CreateTopicsResponse)
				ctRes.Topics = make([]kmsg.CreateTopicsResponseTopic, 1)
				ctRes.Topics[0] = kmsg.NewCreateTopicsResponseTopic()
				ctRes.Topics[0].Topic = testutil.TopicNameForTest("create_topic_fail")
				ctRes.Topics[0].ReplicationFactor = int16(1)
				ctRes.Topics[0].NumPartitions = int32(1)

				ctRes.Topics[0].ErrorCode = kerr.PolicyViolation.Code

				return ctRes, nil, true

			default:
				assert.Fail(fmt.Sprintf("unexpected call to fake kafka request %+T", v))

				return nil, nil, false
			}
		})

		// undo switch
		defer func() {
			if oldKafkaSvc != nil {
				s.api.KafkaSvc = oldKafkaSvc
			}
			if oldConsoleSvc != nil {
				s.api.ConsoleSvc = oldConsoleSvc
			}
		}()

		// make the request
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		input := &createTopicRequest{
			TopicName:         testutil.TopicNameForTest("create_topic_fail"),
			PartitionCount:    1,
			ReplicationFactor: 1,
		}

		res, body := s.apiRequest(ctx, http.MethodPost, "/api/topics", input)

		assert.Equal(503, res.StatusCode)

		apiErr := restAPIError{}

		err = json.Unmarshal(body, &apiErr)
		assert.NoError(err)

		assert.Equal(`Failed to create topic, kafka responded with the following error: POLICY_VIOLATION: Request parameters do not satisfy the configured policy.`, apiErr.Message)

		assert.Equal(503, apiErr.Status)
	})
}
