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

	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/kafka"
	"github.com/redpanda-data/console/backend/pkg/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kfake"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"
)

func (s *APIIntegrationTestSuite) TestHandleGetTopics() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	logCfg := zap.NewDevelopmentConfig()
	logCfg.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
	log, err := logCfg.Build()
	require.NoError(err)

	// create some test topics
	testutil.CreateTestData(t, context.Background(), s.kafkaClient, s.kafkaAdminClient,
		testutil.TopicNameForTest("get_topics_0"))

	testutil.CreateTestData(t, context.Background(), s.kafkaClient, s.kafkaAdminClient,
		testutil.TopicNameForTest("get_topics_1"))

	testutil.CreateTestData(t, context.Background(), s.kafkaClient, s.kafkaAdminClient,
		testutil.TopicNameForTest("get_topics_2"))

	defer func() {
		s.kafkaAdminClient.DeleteTopics(context.Background(),
			testutil.TopicNameForTest("get_topics_0"),
			testutil.TopicNameForTest("get_topics_1"),
			testutil.TopicNameForTest("get_topics_2"))
	}()

	t.Run("happy path", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		res, body := s.apiRequest(ctx, http.MethodGet, "/api/topics", nil)

		assert.Equal(200, res.StatusCode)

		type response struct {
			Topics []*console.TopicSummary `json:"topics"`
		}

		getRes := response{}

		err := json.Unmarshal(body, &getRes)
		assert.NoError(err)

		assert.Len(getRes.Topics, 3)
		assert.Equal(testutil.TopicNameForTest("get_topics_0"), getRes.Topics[0].TopicName)
		assert.Equal(testutil.TopicNameForTest("get_topics_1"), getRes.Topics[1].TopicName)
		assert.Equal(testutil.TopicNameForTest("get_topics_2"), getRes.Topics[2].TopicName)
	})

	t.Run("no see permission", func(t *testing.T) {
		topicName := testutil.TopicNameForTest("get_topics_1")

		oldHooks := s.api.Hooks
		newHooks := newAssertHooks(t, map[string]map[string]bool{
			"CanSeeTopic": {
				testutil.TopicNameForTest("get_topics_0"): true,
				topicName: false,
				testutil.TopicNameForTest("get_topics_2"): true,
			},
			"AllowedTopicActions": {
				"any": true,
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

		res, body := s.apiRequest(ctx, http.MethodGet, "/api/topics", nil)

		assert.Equal(200, res.StatusCode)

		type response struct {
			Topics []*console.TopicSummary `json:"topics"`
		}

		getRes := response{}

		err := json.Unmarshal(body, &getRes)
		assert.NoError(err)

		assert.Len(getRes.Topics, 2)
		assert.Equal(testutil.TopicNameForTest("get_topics_0"), getRes.Topics[0].TopicName)
		assert.Equal(testutil.TopicNameForTest("get_topics_2"), getRes.Topics[1].TopicName)
	})

	t.Run("get metadata fail", func(t *testing.T) {
		// fake cluster
		fakeCluster, err := kfake.NewCluster(kfake.NumBrokers(1))
		assert.NoError(err)

		fakeClient, fakeAdminClient := testutil.CreateClients(t, fakeCluster.ListenAddrs())

		// create fake data
		testutil.CreateTestData(t, context.Background(), fakeClient, fakeAdminClient,
			testutil.TopicNameForTest("get_topics_0"))

		testutil.CreateTestData(t, context.Background(), fakeClient, fakeAdminClient,
			testutil.TopicNameForTest("get_topics_1"))

		testutil.CreateTestData(t, context.Background(), fakeClient, fakeAdminClient,
			testutil.TopicNameForTest("get_topics_2"))

		defer func() {
			fakeCluster.Close()
		}()

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
				assert.Len(v.Topics, 0)

				ctRes := v.ResponseKind().(*kmsg.MetadataResponse)
				ctRes.Topics = make([]kmsg.MetadataResponseTopic, 3)
				ctRes.Topics[0] = kmsg.NewMetadataResponseTopic()
				ctRes.Topics[0].Topic = kmsg.StringPtr(testutil.TopicNameForTest("get_topics_0"))

				ctRes.Topics[1] = kmsg.NewMetadataResponseTopic()
				ctRes.Topics[1].Topic = kmsg.StringPtr(testutil.TopicNameForTest("get_topics_1"))
				ctRes.Topics[1].ErrorCode = kerr.LeaderNotAvailable.Code

				ctRes.Topics[2] = kmsg.NewMetadataResponseTopic()
				ctRes.Topics[2].Topic = kmsg.StringPtr(testutil.TopicNameForTest("get_topics_2"))

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

		res, body := s.apiRequest(ctx, http.MethodGet, "/api/topics", nil)

		assert.Equal(500, res.StatusCode)

		apiErr := restAPIError{}

		err = json.Unmarshal(body, &apiErr)
		assert.NoError(err)

		assert.Equal(`Could not list topics from Kafka cluster`, apiErr.Message)

		assert.Equal(500, apiErr.Status)
	})

	t.Run("describe configs fail", func(t *testing.T) {
		// fake cluster
		fakeCluster, err := kfake.NewCluster(kfake.NumBrokers(1))
		assert.NoError(err)

		fakeClient, fakeAdminClient := testutil.CreateClients(t, fakeCluster.ListenAddrs())

		// create fake data
		testutil.CreateTestData(t, context.Background(), fakeClient, fakeAdminClient,
			testutil.TopicNameForTest("get_topics_0"))

		testutil.CreateTestData(t, context.Background(), fakeClient, fakeAdminClient,
			testutil.TopicNameForTest("get_topics_1"))

		testutil.CreateTestData(t, context.Background(), fakeClient, fakeAdminClient,
			testutil.TopicNameForTest("get_topics_2"))

		defer func() {
			fakeCluster.Close()
		}()

		newConfig := s.copyConfig()

		core, obs := observer.New(zap.WarnLevel)
		log := zap.New(core)

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
			case *kmsg.DescribeConfigsRequest:
				// TODO(bojan) this request is not mocked / controlled by kfake yet
				// See https://github.com/twmb/franz-go/blob/master/pkg/kfake/NOTES

				assert.Len(v.Resources, 3)
				assert.Equal(kmsg.ConfigResourceTypeTopic, v.Resources[0].ResourceType)
				assert.Equal(testutil.TopicNameForTest("get_topics_0"), v.Resources[0].ResourceName)
				assert.Equal([]string{"cleanup.policy"}, v.Resources[0].ConfigNames)

				assert.Equal(kmsg.ConfigResourceTypeTopic, v.Resources[1].ResourceType)
				assert.Equal(testutil.TopicNameForTest("get_topics_1"), v.Resources[1].ResourceName)
				assert.Equal([]string{"cleanup.policy"}, v.Resources[1].ConfigNames)

				assert.Equal(kmsg.ConfigResourceTypeTopic, v.Resources[2].ResourceType)
				assert.Equal(testutil.TopicNameForTest("get_topics_2"), v.Resources[1].ResourceName)
				assert.Equal([]string{"cleanup.policy"}, v.Resources[2].ConfigNames)

				drRes := v.ResponseKind().(*kmsg.DescribeConfigsResponse)
				drRes.Resources = make([]kmsg.DescribeConfigsResponseResource, 3)
				drRes.Resources[0].Configs = make([]kmsg.DescribeConfigsResponseResourceConfig, 0)
				drRes.Resources[1].Configs = make([]kmsg.DescribeConfigsResponseResourceConfig, 0)
				drRes.Resources[2].Configs = make([]kmsg.DescribeConfigsResponseResourceConfig, 0)

				drRes.Resources[2].ErrorCode = kerr.InvalidTopicException.Code

				return drRes, nil, true

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

		res, body := s.apiRequest(ctx, http.MethodGet, "/api/topics", nil)

		assert.Equal(200, res.StatusCode)

		type response struct {
			Topics []*console.TopicSummary `json:"topics"`
		}

		getRes := response{}

		err = json.Unmarshal(body, &getRes)
		assert.NoError(err)

		assert.Len(getRes.Topics, 3)
		assert.Equal(testutil.TopicNameForTest("get_topics_0"), getRes.Topics[0].TopicName)
		assert.Equal(testutil.TopicNameForTest("get_topics_1"), getRes.Topics[1].TopicName)
		assert.Equal(testutil.TopicNameForTest("get_topics_2"), getRes.Topics[2].TopicName)

		// verify warning logs
		allLogs := obs.All()

		assert.Len(allLogs, 2)
		assert.Equal("could not describe topic configs", allLogs[0].Message)
		assert.Equal(zap.ErrorLevel, allLogs[0].Level)
		assert.Equal("failed to fetch topic configs to return cleanup.policy", allLogs[1].Message)
		assert.Equal(zap.WarnLevel, allLogs[1].Level)
	})
}
