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
	"fmt"
	"io"
	"math"
	"math/rand"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/cloudhut/common/logging"
	"github.com/cloudhut/common/rest"
	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kfake"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/connect"
	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/kafka"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
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

	port := rand.Intn(50000) + 10000

	cfg := &config.Config{
		REST: config.Server{
			Config: rest.Config{
				HTTPListenAddress: "0.0.0.0",
				HTTPListenPort:    port,
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

	api := New(cfg)

	go api.Start()

	kafkaClient, err := kgo.NewClient(kgo.SeedBrokers(s.testSeedBroker))
	require.NoError(err)

	kafkaAdminClient := kadm.NewClient(kafkaClient)

	// allow for server to start
	timer1 := time.NewTimer(10 * time.Millisecond)
	<-timer1.C

	apiServer := api.Cfg.REST.HTTPListenAddress + ":" + strconv.FormatInt(int64(port), 10)

	t.Run("happy path", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		input := &createTopicRequest{
			TopicName:         testutil.TopicNameForTest("create_topic"),
			PartitionCount:    1,
			ReplicationFactor: 1,
		}

		res, body := apiRequest(t, ctx, apiServer, input)

		assert.Equal(200, res.StatusCode)

		createTopicRes := console.CreateTopicResponse{}

		topicName := testutil.TopicNameForTest("create_topic")

		err := json.Unmarshal(body, &createTopicRes)
		assert.NoError(err)
		assert.Equal(topicName, createTopicRes.TopicName)
		assert.Equal(int32(-1), createTopicRes.PartitionCount)    // is this correct?
		assert.Equal(int16(-1), createTopicRes.ReplicationFactor) // is this correct?
		assert.Len(createTopicRes.CreateTopicResponseConfigs, 4)

		mdRes, err := kafkaAdminClient.Metadata(ctx, topicName)
		assert.NoError(err)
		assert.Len(mdRes.Topics, 1)

		assert.NotEmpty(mdRes.Topics[topicName])

		topic := mdRes.Topics[topicName]

		assert.Len(topic.Partitions, 1)
		assert.NotEmpty(topic.Partitions[0])
		assert.Len(topic.Partitions[0].Replicas, 1)
		assert.Empty(topic.Err)

		dtRes, err := kafkaAdminClient.DescribeTopicConfigs(ctx, topicName)
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

		res, body := apiRequest(t, ctx, apiServer, input)

		assert.Equal(200, res.StatusCode)

		createTopicRes := console.CreateTopicResponse{}

		topicName := testutil.TopicNameForTest("create_topic_multi")

		err := json.Unmarshal(body, &createTopicRes)
		assert.NoError(err)
		assert.Equal(topicName, createTopicRes.TopicName)
		assert.Equal(int32(-1), createTopicRes.PartitionCount)
		assert.Equal(int16(-1), createTopicRes.ReplicationFactor)
		assert.Len(createTopicRes.CreateTopicResponseConfigs, 4)

		mdRes, err := kafkaAdminClient.Metadata(ctx, topicName)
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

		dtRes, err := kafkaAdminClient.DescribeTopicConfigs(ctx, topicName)
		assert.NoError(err)

		assert.Len(dtRes, 1)

		assert.NoError(dtRes[0].Err)
		assert.True(len(dtRes[0].Configs) > 0)
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

		res, body := apiRequest(t, ctx, apiServer, input)

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

		res, body := apiRequest(t, ctx, apiServer, input)

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

		res, body := apiRequest(t, ctx, apiServer, input)

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
		oldHooks := api.Hooks
		newHooks := newAssertHooks(t, map[string]bool{
			"CanCreateTopic": false,
		})

		if newHooks != nil {
			api.Hooks = newHooks
		}

		defer func() {
			if oldHooks != nil {
				api.Hooks = oldHooks
			}
		}()

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		input := &createTopicRequest{
			TopicName:         testutil.TopicNameForTest("no_permission"),
			PartitionCount:    1,
			ReplicationFactor: 1,
		}

		res, body := apiRequest(t, ctx, apiServer, input)

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

		// hacky way to copy config struct
		cfgJSON, err := json.Marshal(cfg)
		require.NoError(err)

		newConfig := config.Config{}
		err = json.Unmarshal(cfgJSON, &newConfig)
		require.NoError(err)

		// new kafka service
		newConfig.Kafka.Brokers = fakeCluster.ListenAddrs()
		newKafkaSvc, err := kafka.NewService(&newConfig, log,
			testutil.MetricNameForTest(strings.ReplaceAll(t.Name(), " ", "")))
		assert.NoError(err)

		// new console service
		newConsoleSvc, err := console.NewService(newConfig.Console, log, newKafkaSvc, api.RedpandaSvc, api.ConnectSvc)
		assert.NoError(err)

		// save old
		oldConsoleSvc := api.ConsoleSvc
		oldKafkaSvc := api.KafkaSvc

		// switch
		api.KafkaSvc = newKafkaSvc
		api.ConsoleSvc = newConsoleSvc

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
				api.KafkaSvc = oldKafkaSvc
			}
			if oldConsoleSvc != nil {
				api.ConsoleSvc = oldConsoleSvc
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

		res, body := apiRequest(t, ctx, apiServer, input)

		assert.Equal(503, res.StatusCode)

		apiErr := restAPIError{}

		err = json.Unmarshal(body, &apiErr)
		assert.NoError(err)

		assert.Equal(`Failed to create topic, kafka responded with the following error: POLICY_VIOLATION: Request parameters do not satisfy the configured policy.`, apiErr.Message)

		assert.Equal(503, apiErr.Status)
	})
}

func apiRequest(t *testing.T, ctx context.Context,
	apiServer string, input *createTopicRequest,
) (*http.Response, []byte) {
	t.Helper()

	data, err := json.Marshal(input)
	require.NoError(t, err)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://"+apiServer+"/api/topics", bytes.NewReader(data))
	require.NoError(t, err)

	req.Header.Set("Content-Type", "application/json")

	res, err := http.DefaultClient.Do(req)
	assert.NoError(t, err)

	body, err := io.ReadAll(res.Body)
	res.Body.Close()
	assert.NoError(t, err)

	return res, body
}

func assertHookCall(t *testing.T) {
	pc, _, _, _ := runtime.Caller(1)
	fnName := runtime.FuncForPC(pc).Name()
	assert.Fail(t, "unexpected call to hook function:"+fnName)
}

// assertHooks is the default hook for tests that deny everything by default and assert when functions are called
type assertHooks struct {
	t *testing.T

	allowedCalls map[string]struct{}
	returnValues map[string]bool
}

func (a *assertHooks) isCallAllowed() bool {
	pc, _, _, _ := runtime.Caller(1)
	fnName := runtime.FuncForPC(pc).Name()
	parts := strings.Split(fnName, ".")
	fnName = parts[len(parts)-1]
	_, ok := a.allowedCalls[fnName]
	return ok
}

func (a *assertHooks) getCallReturnValue() bool {
	pc, _, _, _ := runtime.Caller(1)
	fnName := runtime.FuncForPC(pc).Name()
	parts := strings.Split(fnName, ".")
	fnName = parts[len(parts)-1]
	return a.returnValues[fnName]
}

func newAssertHooks(t *testing.T, returnValues map[string]bool) *Hooks {
	h := &assertHooks{
		allowedCalls: map[string]struct{}{},
		returnValues: map[string]bool{},
	}

	for n, v := range returnValues {
		h.allowedCalls[n] = struct{}{}
		h.returnValues[n] = v
	}

	return &Hooks{
		Authorization: h,
		Route:         h,
		Console:       h,
	}
}

// Router Hooks
func (a *assertHooks) ConfigAPIRouter(_ chi.Router)      {}
func (a *assertHooks) ConfigWsRouter(_ chi.Router)       {}
func (a *assertHooks) ConfigInternalRouter(_ chi.Router) {}
func (a *assertHooks) ConfigRouter(_ chi.Router)         {}

// Authorization Hooks
func (a *assertHooks) CanSeeTopic(_ context.Context, _ string) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}

	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanCreateTopic(_ context.Context, _ string) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanEditTopicConfig(_ context.Context, _ string) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanDeleteTopic(_ context.Context, _ string) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanPublishTopicRecords(_ context.Context, _ string) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanDeleteTopicRecords(_ context.Context, _ string) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanViewTopicPartitions(_ context.Context, _ string) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanViewTopicConfig(_ context.Context, _ string) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanViewTopicMessages(_ context.Context, _ *ListMessagesRequest) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanUseMessageSearchFilters(_ context.Context, _ *ListMessagesRequest) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanViewTopicConsumers(_ context.Context, _ string) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) AllowedTopicActions(_ context.Context, _ string) ([]string, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return []string{}, nil
}

func (a *assertHooks) PrintListMessagesAuditLog(_ *http.Request, _ *console.ListMessageRequest) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
}

func (a *assertHooks) CanListACLs(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanCreateACL(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanDeleteACL(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanListQuotas(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanSeeConsumerGroup(_ context.Context, _ string) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanEditConsumerGroup(_ context.Context, _ string) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanDeleteConsumerGroup(_ context.Context, _ string) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) AllowedConsumerGroupActions(_ context.Context, _ string) ([]string, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return []string{}, nil
}

func (a *assertHooks) CanPatchPartitionReassignments(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanPatchConfigs(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanViewConnectCluster(_ context.Context, _ string) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanEditConnectCluster(_ context.Context, _ string) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanDeleteConnectCluster(_ context.Context, _ string) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) AllowedConnectClusterActions(_ context.Context, _ string) ([]string, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return []string{}, nil
}

func (a *assertHooks) CanListKafkaUsers(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanCreateKafkaUsers(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) CanDeleteKafkaUsers(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return a.getCallReturnValue(), nil
}

func (a *assertHooks) IsProtectedKafkaUser(_ string) bool {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return false
}

// Console hooks
func (a *assertHooks) ConsoleLicenseInformation(_ context.Context) redpanda.License {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return redpanda.License{Source: redpanda.LicenseSourceConsole, Type: redpanda.LicenseTypeOpenSource, ExpiresAt: math.MaxInt32}
}

func (a *assertHooks) EnabledFeatures() []string {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return []string{}
}

func (a *assertHooks) EndpointCompatibility() []console.EndpointCompatibilityEndpoint {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return nil
}

func (a *assertHooks) EnabledConnectClusterFeatures(_ context.Context, _ string) []connect.ClusterFeature {
	if !a.isCallAllowed() {
		assertHookCall(a.t)
	}
	return nil
}
