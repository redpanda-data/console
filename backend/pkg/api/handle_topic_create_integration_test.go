//go:build integration

package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/cloudhut/common/logging"
	"github.com/cloudhut/common/rest"
	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/console"
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

				resBody := string(body)
				fmt.Println("!!!", resBody)

				apiErr := restAPIError{}

				err := json.Unmarshal(body, &apiErr)
				assert.NoError(t, err)

				assert.Equal(t,
					`validating the decoded object failed: valid characters for Kafka topics are the ASCII alphanumeric characters and '.', '_', '-'`,
					apiErr.Message)

				assert.Equal(t, 400, apiErr.Status)
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			data, err := json.Marshal(tc.input)
			require.NoError(t, err)

			req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://"+apiServer+"/api/topics", bytes.NewReader(data))
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
