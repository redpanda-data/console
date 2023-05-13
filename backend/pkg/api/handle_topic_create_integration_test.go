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
	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/connect"
	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"
)

type restAPIError struct {
	Status  int    `json:"statusCode"`
	Message string `json:"message"`
}

func Test_handleCreateTopic(t *testing.T) {
	port := rand.Intn(50000) + 10000

	api := New(&config.Config{
		REST: config.Server{
			Config: rest.Config{
				HTTPListenAddress: "0.0.0.0",
				HTTPListenPort:    port,
			},
		},
		Kafka: config.Kafka{
			Brokers: []string{testSeedBroker},
		},
		Connect: config.Connect{
			Enabled: false,
		},
		Logger: logging.Config{
			LogLevelInput: "info",
			LogLevel:      zap.NewAtomicLevel(),
		},
	})

	go api.Start()

	kafkaClient, err := kgo.NewClient(kgo.SeedBrokers(testSeedBroker))
	require.NoError(t, err)

	kafkaAdminClient := kadm.NewClient(kafkaClient)

	// allow for server to start
	timer1 := time.NewTimer(10 * time.Millisecond)
	<-timer1.C

	apiServer := api.Cfg.REST.HTTPListenAddress + ":" + strconv.FormatInt(int64(port), 10)

	type test struct {
		name        string
		input       *createTopicRequest
		customHooks func(t *testing.T) *Hooks
		expect      func(context.Context, *http.Response, []byte)
		expectError string
		cleanup     func(context.Context)
	}

	tests := []test{
		{
			name: "happy path",
			input: &createTopicRequest{
				TopicName:         topicNameForTest("create_topic"),
				PartitionCount:    1,
				ReplicationFactor: 1,
			},
			expect: func(ctx context.Context, res *http.Response, body []byte) {
				assert.Equal(t, 200, res.StatusCode)

				createTopicRes := console.CreateTopicResponse{}

				topicName := topicNameForTest("create_topic")

				err := json.Unmarshal(body, &createTopicRes)
				assert.NoError(t, err)
				assert.Equal(t, topicName, createTopicRes.TopicName)
				assert.Equal(t, int32(-1), createTopicRes.PartitionCount)    // is this correct?
				assert.Equal(t, int16(-1), createTopicRes.ReplicationFactor) // is this correct?
				assert.Len(t, createTopicRes.CreateTopicResponseConfigs, 4)

				mdRes, err := kafkaAdminClient.Metadata(ctx, topicName)
				assert.NoError(t, err)
				assert.Len(t, mdRes.Topics, 1)

				assert.NotEmpty(t, mdRes.Topics[topicName])

				topic := mdRes.Topics[topicName]

				assert.Len(t, topic.Partitions, 1)
				assert.NotEmpty(t, topic.Partitions[0])
				assert.Len(t, topic.Partitions[0].Replicas, 1)
				assert.Empty(t, topic.Err)

				dtRes, err := kafkaAdminClient.DescribeTopicConfigs(ctx, topicName)
				assert.NoError(t, err)

				assert.Len(t, dtRes, 1)

				assert.NoError(t, dtRes[0].Err)
				assert.True(t, len(dtRes[0].Configs) > 0)
				assert.Equal(t, dtRes[0].Name, topicName)
			},
		},
		{
			name: "happy path multi partition",
			input: &createTopicRequest{
				TopicName:         topicNameForTest("create_topic_multi"),
				PartitionCount:    2,
				ReplicationFactor: 1,
			},
			expect: func(ctx context.Context, res *http.Response, body []byte) {
				assert.Equal(t, 200, res.StatusCode)

				createTopicRes := console.CreateTopicResponse{}

				topicName := topicNameForTest("create_topic_multi")

				err := json.Unmarshal(body, &createTopicRes)
				assert.NoError(t, err)
				assert.Equal(t, topicName, createTopicRes.TopicName)
				assert.Equal(t, int32(-1), createTopicRes.PartitionCount)
				assert.Equal(t, int16(-1), createTopicRes.ReplicationFactor)
				assert.Len(t, createTopicRes.CreateTopicResponseConfigs, 4)

				mdRes, err := kafkaAdminClient.Metadata(ctx, topicName)
				assert.NoError(t, err)
				assert.Len(t, mdRes.Topics, 1)

				assert.NotEmpty(t, mdRes.Topics[topicName])

				topic := mdRes.Topics[topicName]

				assert.Len(t, topic.Partitions, 2)
				assert.NotEmpty(t, topic.Partitions[0])
				assert.Len(t, topic.Partitions[0].Replicas, 1)
				assert.NotEmpty(t, topic.Partitions[1], 1)
				assert.Len(t, topic.Partitions[1].Replicas, 1)
				assert.Empty(t, topic.Err)

				dtRes, err := kafkaAdminClient.DescribeTopicConfigs(ctx, topicName)
				assert.NoError(t, err)

				assert.Len(t, dtRes, 1)

				assert.NoError(t, dtRes[0].Err)
				assert.True(t, len(dtRes[0].Configs) > 0)
				assert.Equal(t, dtRes[0].Name, topicName)
			},
		},
		{
			name: "no partition",
			input: &createTopicRequest{
				TopicName:         topicNameForTest("no_partition"),
				PartitionCount:    0,
				ReplicationFactor: 1,
			},
			expect: func(ctx context.Context, res *http.Response, body []byte) {
				assert.Equal(t, 400, res.StatusCode)

				apiErr := restAPIError{}

				err := json.Unmarshal(body, &apiErr)
				assert.NoError(t, err)

				assert.Equal(t,
					"validating the decoded object failed: you must create a topic with at least one partition",
					apiErr.Message)

				assert.Equal(t, 400, apiErr.Status)
			},
		},
		{
			name: "no replication",
			input: &createTopicRequest{
				TopicName:         topicNameForTest("no_replication"),
				PartitionCount:    1,
				ReplicationFactor: 0,
			},
			expect: func(ctx context.Context, res *http.Response, body []byte) {
				assert.Equal(t, 400, res.StatusCode)

				apiErr := restAPIError{}

				err := json.Unmarshal(body, &apiErr)
				assert.NoError(t, err)

				assert.Equal(t,
					"validating the decoded object failed: replication factor must be 1 or more",
					apiErr.Message)

				assert.Equal(t, 400, apiErr.Status)
			},
		},
		{
			name: "invalid topic name",
			input: &createTopicRequest{
				TopicName:         topicNameForTest("invalid topic name"),
				PartitionCount:    1,
				ReplicationFactor: 0,
			},
			expect: func(ctx context.Context, res *http.Response, body []byte) {
				assert.Equal(t, 400, res.StatusCode)

				apiErr := restAPIError{}

				err := json.Unmarshal(body, &apiErr)
				assert.NoError(t, err)

				assert.Equal(t,
					`validating the decoded object failed: valid characters for Kafka topics are the ASCII alphanumeric characters and '.', '_', '-'`,
					apiErr.Message)

				assert.Equal(t, 400, apiErr.Status)
			},
		},
		{
			name: "no permission",
			input: &createTopicRequest{
				TopicName:         topicNameForTest("no_permission"),
				PartitionCount:    1,
				ReplicationFactor: 1,
			},
			customHooks: func(t *testing.T) *Hooks {
				return newAssertHooks(t, map[string]bool{
					"CanCreateTopic": false,
				})
			},
			expect: func(ctx context.Context, res *http.Response, body []byte) {
				assert.Equal(t, 403, res.StatusCode)

				apiErr := restAPIError{}

				err := json.Unmarshal(body, &apiErr)
				assert.NoError(t, err)

				assert.Equal(t, `You don't have permissions to create this topic.`, apiErr.Message)

				assert.Equal(t, 403, apiErr.Status)
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {

			var oldHooks *Hooks
			if tc.customHooks != nil {
				oldHooks = api.Hooks
				newHooks := tc.customHooks(t)
				if newHooks != nil {
					api.Hooks = newHooks
				}
			}

			defer func() {
				if oldHooks != nil {
					api.Hooks = oldHooks
				}
			}()

			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			data, err := json.Marshal(tc.input)
			require.NoError(t, err)

			req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://"+apiServer+"/api/topics", bytes.NewReader(data))
			require.NoError(t, err)

			req.Header.Set("Content-Type", "application/json")

			res, err := http.DefaultClient.Do(req)
			assert.NoError(t, err)

			body, err := io.ReadAll(res.Body)
			res.Body.Close()
			assert.NoError(t, err)

			fmt.Println(string(body))

			tc.expect(ctx, res, body)
		})
	}
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
