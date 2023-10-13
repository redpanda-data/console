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
	"io"
	"math"
	"math/rand"
	"net"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/cloudhut/common/rest"
	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go/modules/redpanda"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/connect"
	"github.com/redpanda-data/console/backend/pkg/console"
	rp "github.com/redpanda-data/console/backend/pkg/redpanda"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

type APIIntegrationTestSuite struct {
	suite.Suite

	redpandaContainer *redpanda.Container

	kafkaClient      *kgo.Client
	kafkaAdminClient *kadm.Client

	cfg *config.Config
	api *API

	testSeedBroker string
}

func TestSuite(t *testing.T) {
	suite.Run(t, &APIIntegrationTestSuite{})
}

func (s *APIIntegrationTestSuite) SetupSuite() {
	t := s.T()
	require := require.New(t)

	ctx := context.Background()
	container, err := redpanda.RunContainer(ctx)
	require.NoError(err)
	s.redpandaContainer = container

	seedBroker, err := container.KafkaSeedBroker(ctx)
	require.NoError(err)
	schemaRegistryAddress, err := container.SchemaRegistryAddress(ctx)
	require.NoError(err)

	s.testSeedBroker = seedBroker

	s.kafkaClient, s.kafkaAdminClient = testutil.CreateClients(t, []string{seedBroker})

	httpListenPort := rand.Intn(50000) + 10000
	s.cfg = &config.Config{}
	s.cfg.SetDefaults()
	s.cfg.ServeFrontend = false
	s.cfg.REST = config.Server{
		Config: rest.Config{
			HTTPListenAddress: "0.0.0.0",
			HTTPListenPort:    httpListenPort,
		},
	}
	s.cfg.Kafka.Brokers = []string{s.testSeedBroker}
	s.cfg.Kafka.Schema.Enabled = true
	s.cfg.Kafka.Schema.URLs = []string{schemaRegistryAddress}
	s.api = New(s.cfg)

	go s.api.Start()

	// allow for server to start
	httpServerAddress := net.JoinHostPort("localhost", strconv.Itoa(httpListenPort))
	retries := 60
	for retries > 0 {
		if _, err := net.DialTimeout("tcp", httpServerAddress, 100*time.Millisecond); err == nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
		retries--
	}
}

func (s *APIIntegrationTestSuite) TearDownSuite() {
	t := s.T()
	assert := require.New(t)

	assert.NoError(s.redpandaContainer.Terminate(context.Background()))

	assert.NoError(s.api.server.Server.Shutdown(context.Background()))
}

func (s *APIIntegrationTestSuite) httpAddress() string {
	if s.api.Cfg.REST.TLS.Enabled {
		return "https://" + s.api.Cfg.REST.HTTPListenAddress + ":" + strconv.FormatInt(int64(s.api.Cfg.REST.HTTPSListenPort), 10)
	}
	return "http://" + s.api.Cfg.REST.HTTPListenAddress + ":" + strconv.FormatInt(int64(s.api.Cfg.REST.HTTPListenPort), 10)
}

func (s *APIIntegrationTestSuite) copyConfig() *config.Config {
	t := s.T()

	// hacky way to copy config struct
	cfgJSON, err := json.Marshal(s.cfg)
	require.NoError(t, err)

	newConfig := config.Config{}
	err = json.Unmarshal(cfgJSON, &newConfig)
	require.NoError(t, err)

	return &newConfig
}

func (s *APIIntegrationTestSuite) apiRequest(ctx context.Context,
	method, path string, input interface{},
) (*http.Response, []byte) {
	t := s.T()

	var err error
	var data []byte
	if input != nil {
		data, err = json.Marshal(input)
		require.NoError(t, err)
	}

	req, err := http.NewRequestWithContext(ctx, method, s.httpAddress()+path, bytes.NewReader(data))
	require.NoError(t, err)

	req.Header.Set("Content-Type", "application/json")

	res, err := http.DefaultClient.Do(req)
	require.NoError(t, err)

	body, err := io.ReadAll(res.Body)
	res.Body.Close()
	assert.NoError(t, err)

	return res, body
}

type assertCallReturnValue struct {
	Err        *rest.Error
	BoolValue  bool
	SliceValue []string
}

func assertHookCall(t *testing.T) {
	pc, _, _, _ := runtime.Caller(1)
	fnName := runtime.FuncForPC(pc).Name()
	assert.Fail(t, "unexpected call to hook function:"+fnName)
}

// assertHooks is the default hook for tests that deny everything by default and assert when functions are called
type assertHooks struct {
	t *testing.T

	allowedCalls map[string]map[string]bool
	returnValues map[string]map[string]assertCallReturnValue
}

func (a *assertHooks) isCallAllowed(topicName string) bool {
	// The target system may have created internal topics, which
	// use an underscore prefix by convention. The calls to such topics
	// are expected and therefore are allowed.
	if strings.HasPrefix(topicName, "_") {
		return true
	}
	pc, _, _, _ := runtime.Caller(1)
	fnName := runtime.FuncForPC(pc).Name()
	parts := strings.Split(fnName, ".")
	fnName = parts[len(parts)-1]
	topicMap, ok := a.allowedCalls[fnName]
	if !ok || len(topicMap) == 0 {
		return false
	}
	if v, ok := topicMap["any"]; ok {
		return v
	}
	return topicMap[topicName]
}

func (a *assertHooks) getCallReturnValue(topicName string) assertCallReturnValue {
	pc, _, _, _ := runtime.Caller(1)
	fnName := runtime.FuncForPC(pc).Name()
	parts := strings.Split(fnName, ".")
	fnName = parts[len(parts)-1]
	topicMap, ok := a.returnValues[fnName]
	if !ok || len(topicMap) == 0 {
		return assertCallReturnValue{}
	}
	if v, ok := topicMap["any"]; ok {
		return v
	}
	return topicMap[topicName]
}

func newAssertHooks(t *testing.T, returnValues map[string]map[string]assertCallReturnValue) *Hooks {
	h := &assertHooks{
		t:            t,
		allowedCalls: map[string]map[string]bool{},
		returnValues: map[string]map[string]assertCallReturnValue{},
	}

	for n, v := range returnValues {
		for tn := range v {
			if len(h.allowedCalls[n]) == 0 {
				h.allowedCalls[n] = map[string]bool{}
			}

			h.allowedCalls[n][tn] = true
		}

		h.returnValues[n] = v
	}

	return &Hooks{
		Authorization: h,
		Route:         h,
		Console:       h,
	}
}

// Router Hooks
func (a *assertHooks) ConfigAPIRouter(_ chi.Router)                 {}
func (a *assertHooks) ConfigAPIRouterPostRegistration(_ chi.Router) {}
func (a *assertHooks) ConfigWsRouter(_ chi.Router)                  {}
func (a *assertHooks) ConfigInternalRouter(_ chi.Router)            {}
func (a *assertHooks) ConfigRouter(_ chi.Router)                    {}
func (a *assertHooks) ConfigConnectRPC(_ ConfigConnectRPCRequest) ConfigConnectRPCResponse {
	return ConfigConnectRPCResponse{}
}

// Authorization Hooks
func (a *assertHooks) CanSeeTopic(_ context.Context, topic string) (bool, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}

	rv := a.getCallReturnValue(topic)

	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanCreateTopic(_ context.Context, topic string) (bool, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanEditTopicConfig(_ context.Context, topic string) (bool, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanDeleteTopic(_ context.Context, topic string) (bool, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanPublishTopicRecords(_ context.Context, topic string) (bool, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanDeleteTopicRecords(_ context.Context, topic string) (bool, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanViewTopicPartitions(_ context.Context, topic string) (bool, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanViewTopicConfig(_ context.Context, topic string) (bool, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanViewTopicMessages(_ context.Context, r *ListMessagesRequest) (bool, *rest.Error) {
	if !a.isCallAllowed(r.TopicName) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(r.TopicName)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanUseMessageSearchFilters(_ context.Context, r *ListMessagesRequest) (bool, *rest.Error) {
	if !a.isCallAllowed(r.TopicName) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(r.TopicName)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanViewTopicConsumers(_ context.Context, topic string) (bool, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) AllowedTopicActions(_ context.Context, topic string) ([]string, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.SliceValue, rv.Err
}

func (a *assertHooks) PrintListMessagesAuditLog(_ *http.Request, r *console.ListMessageRequest) {
	if !a.isCallAllowed(r.TopicName) {
		assertHookCall(a.t)
	}
}

func (a *assertHooks) CanListACLs(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanCreateACL(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanDeleteACL(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanListQuotas(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanSeeConsumerGroup(_ context.Context, topic string) (bool, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanEditConsumerGroup(_ context.Context, topic string) (bool, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanDeleteConsumerGroup(_ context.Context, topic string) (bool, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) AllowedConsumerGroupActions(_ context.Context, _ string) ([]string, *rest.Error) {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.SliceValue, rv.Err
}

func (a *assertHooks) CanPatchPartitionReassignments(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanPatchConfigs(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanViewConnectCluster(_ context.Context, topic string) (bool, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanEditConnectCluster(_ context.Context, topic string) (bool, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanDeleteConnectCluster(_ context.Context, topic string) (bool, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) AllowedConnectClusterActions(_ context.Context, topic string) ([]string, *rest.Error) {
	if !a.isCallAllowed(topic) {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue(topic)
	return rv.SliceValue, rv.Err
}

func (a *assertHooks) CanListKafkaUsers(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanCreateKafkaUsers(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanDeleteKafkaUsers(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanViewSchemas(ctx context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanCreateSchemas(ctx context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanDeleteSchemas(ctx context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) CanManageSchemaRegistry(_ context.Context) (bool, *rest.Error) {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.BoolValue, rv.Err
}

func (a *assertHooks) IsProtectedKafkaUser(_ string) bool {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.BoolValue
}

// Console hooks
func (a *assertHooks) ConsoleLicenseInformation(_ context.Context) rp.License {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	return rp.License{Source: rp.LicenseSourceConsole, Type: rp.LicenseTypeOpenSource, ExpiresAt: math.MaxInt32}
}

func (a *assertHooks) EnabledFeatures() []string {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	rv := a.getCallReturnValue("any")
	return rv.SliceValue
}

func (a *assertHooks) EndpointCompatibility() []console.EndpointCompatibilityEndpoint {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	return nil
}

func (a *assertHooks) EnabledConnectClusterFeatures(_ context.Context, _ string) []connect.ClusterFeature {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	return nil
}

func (a *assertHooks) CheckWebsocketConnection(r *http.Request, req ListMessagesRequest) (context.Context, error) {
	if !a.isCallAllowed("any") {
		assertHookCall(a.t)
	}
	return r.Context(), nil
}
