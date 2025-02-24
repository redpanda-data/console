// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package integration

import (
	"context"
	"fmt"
	"maps"
	"net/http"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/carlmjohnson/requests"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kmsg"

	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	v1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
)

func (s *APISuite) TestListTopics_v1() {
	t := s.T()

	// Seed some topics that can be listed
	ctx, cancel := context.WithTimeout(context.Background(), 9*time.Second)
	t.Cleanup(cancel)

	topicPrefix := "console-integration-test-list-topics-"
	topicsToCreate := 5

	createdTopics := make(map[string]struct{})
	for topicsToCreate > 0 {
		topicName := fmt.Sprintf("%v%d", topicPrefix, topicsToCreate)
		require.NoError(t, createKafkaTopic(ctx, s.kafkaAdminClient, topicName, 1))
		createdTopics[topicName] = struct{}{}
		topicsToCreate--
	}

	t.Cleanup(func() {
		for topic := range createdTopics {
			deleteKafkaTopic(context.Background(), s.kafkaAdminClient, topic)
		}
	})

	connectClient := v1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())

	t.Run("list all topics with a valid request (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)
		ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
		t.Cleanup(cancel)

		// 1. List topics
		listTopicsRes, err := connectClient.ListTopics(ctx, connect.NewRequest(&v1.ListTopicsRequest{}))
		require.NoError(err)
		assert.GreaterOrEqual(len(listTopicsRes.Msg.GetTopics()), len(createdTopics))

		// 2. Ensure that we can find all of our previously created topics
		toFind := maps.Clone(createdTopics)
		for _, topic := range listTopicsRes.Msg.GetTopics() {
			if _, exists := toFind[topic.Name]; !exists {
				continue
			}
			delete(toFind, topic.Name)
			if len(toFind) == 0 {
				break
			}
		}
		assert.Emptyf(toFind, "expected all previously created topics in list topics response")
	})

	t.Run("list all topics with a valid filter (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)
		ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
		t.Cleanup(cancel)

		// 1. List topics
		listReq := &v1.ListTopicsRequest{Filter: &v1.ListTopicsRequest_Filter{
			NameContains: topicPrefix,
		}}
		listTopicsRes, err := connectClient.ListTopics(ctx, connect.NewRequest(listReq))
		require.NoError(err)
		assert.Len(listTopicsRes.Msg.GetTopics(), len(createdTopics))

		// 2. Ensure that we can find all of our previously created topics
		toFind := maps.Clone(createdTopics)
		for _, topic := range listTopicsRes.Msg.GetTopics() {
			if _, exists := toFind[topic.Name]; !exists {
				continue
			}
			delete(toFind, topic.Name)
			if len(toFind) == 0 {
				break
			}
		}
		assert.Emptyf(toFind, "expected all previously created topics in list topics response")
	})

	t.Run("list all topics with pagination (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)
		ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
		t.Cleanup(cancel)

		toFind := maps.Clone(createdTopics)

		// 1. List topics (on page 1)
		listReq := &v1.ListTopicsRequest{
			Filter: &v1.ListTopicsRequest_Filter{
				NameContains: topicPrefix,
			},
			PageSize: 3,
		}

		listTopicsRes, err := connectClient.ListTopics(ctx, connect.NewRequest(listReq))
		require.NoError(err)
		assert.Len(listTopicsRes.Msg.GetTopics(), 3)
		require.NotEmpty(listTopicsRes.Msg.GetNextPageToken())

		// 2. Remove the topics found on page one from the toFind map
		for _, topic := range listTopicsRes.Msg.GetTopics() {
			if _, exists := toFind[topic.Name]; !exists {
				continue
			}
			delete(toFind, topic.Name)
		}

		// 3. List topics (on page 2)
		listReq.PageToken = listTopicsRes.Msg.GetNextPageToken()
		listTopicsRes, err = connectClient.ListTopics(ctx, connect.NewRequest(listReq))
		require.NoError(err)
		assert.Len(listTopicsRes.Msg.GetTopics(), 2)
		assert.Empty(listTopicsRes.Msg.GetNextPageToken())

		// 4. Remove the topics found on page two from the toFind map
		for _, topic := range listTopicsRes.Msg.GetTopics() {
			if _, exists := toFind[topic.Name]; !exists {
				continue
			}
			delete(toFind, topic.Name)
		}

		assert.Emptyf(toFind, "expected all previously created topics in list topics response")
	})

	t.Run("list topics with default request (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		type topic struct {
			Name              string `json:"name"`
			Internal          bool   `json:"internal"`
			PartitionCount    int    `json:"partition_count"`
			ReplicationFactor int    `json:"replication_factor"`
		}
		type listTopicsResponse struct {
			Topics        []topic `json:"topics"`
			NextPageToken string  `json:"next_page_token"`
		}
		var httpRes listTopicsResponse
		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1/topics").
			ToJSON(&httpRes).
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)

		assert.GreaterOrEqual(len(httpRes.Topics), len(createdTopics))

		// 2. Ensure that we can find all of our previously created topics
		toFind := maps.Clone(createdTopics)
		for _, topic := range httpRes.Topics {
			if _, exists := toFind[topic.Name]; !exists {
				continue
			}
			delete(toFind, topic.Name)
			if len(toFind) == 0 {
				break
			}
		}
		assert.Emptyf(toFind, "expected all previously created topics in list topics response")
	})
}

func (s *APISuite) TestCreateTopic_v1() {
	t := s.T()

	t.Run("create topic with valid request (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create Topic via Connect API call
		topicName := "console-integration-test-valid-request-connect-go"
		partitionCount := int32(2)
		client := v1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		createReq := &v1.CreateTopicRequest{
			Topic: &v1.CreateTopicRequest_Topic{
				Name:              topicName,
				PartitionCount:    &partitionCount,
				ReplicationFactor: nil, // Default
				Configs: []*v1.CreateTopicRequest_Topic_Config{
					{
						Name:  "cleanup.policy",
						Value: kadm.StringPtr("compact"),
					},
				},
			},
		}
		createTopicRes, err := client.CreateTopic(ctx, connect.NewRequest(createReq))
		require.NoError(err)

		assert.Equal(topicName, createTopicRes.Msg.TopicName)
		assert.EqualValues(partitionCount, createTopicRes.Msg.PartitionCount)
		assert.EqualValues(1, createTopicRes.Msg.ReplicationFactor)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, topicName)
			assert.NoError(err)
		}()

		// 2. Ensure Kafka topic exists
		topicDetails, err := s.kafkaAdminClient.ListTopics(ctx, topicName)
		require.NoError(err)
		require.Truef(topicDetails.Has(topicName), fmt.Sprintf("topic %q should exist", topicName))
		topicsByName := topicDetails.TopicsSet()
		topicDetail := topicsByName[topicName]
		partitionCountReturned := len(topicDetail)
		assert.Equal(int(partitionCount), partitionCountReturned)

		// 3. Ensure that cleanup.policy is set for created topic
		resourceConfigs, err := s.kafkaAdminClient.DescribeTopicConfigs(ctx, topicName)
		require.NoError(err)
		resourceConfig, err := resourceConfigs.On(topicName, nil)
		require.NoError(err)
		require.NoError(resourceConfig.Err)

		foundCleanupPolicy := false
		for _, config := range resourceConfig.Configs {
			if config.Key != "cleanup.policy" {
				continue
			}
			foundCleanupPolicy = true
			assert.Equal(kmsg.ConfigSourceDynamicTopicConfig, config.Source)
			assert.Equal(kadm.StringPtr("compact"), config.Value)
		}
		assert.Truef(foundCleanupPolicy, "could not find cleanup.policy in config response")
	})

	t.Run("create topic with invalid topic name (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		// Try tp create Topic via Connect API call
		topicName := "console-integration-test-bad-topic-name!"
		client := v1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		createReq := &v1.CreateTopicRequest{
			Topic: &v1.CreateTopicRequest_Topic{
				Name: topicName,
			},
		}
		_, err := client.CreateTopic(ctx, connect.NewRequest(createReq))
		require.Error(err)
		assert.Equalf(connect.CodeInvalidArgument.String(), connect.CodeOf(err).String(), "connect error code must be 'INVALID_ARGUMENT'")
	})

	t.Run("create topic in dry-run (connect-go)", func(t *testing.T) {
		require := require.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Start dry-run of create topic via Connect API call
		topicName := "console-integration-test-dry-run-request-connect-go"
		partitionCount := int32(2)
		client := v1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		createReq := &v1.CreateTopicRequest{
			Topic: &v1.CreateTopicRequest_Topic{
				Name:              topicName,
				PartitionCount:    &partitionCount,
				ReplicationFactor: nil, // Default
				Configs: []*v1.CreateTopicRequest_Topic_Config{
					{
						Name:  "cleanup.policy",
						Value: kadm.StringPtr("compact"),
					},
				},
			},
			ValidateOnly: true,
		}
		_, err := client.CreateTopic(ctx, connect.NewRequest(createReq))
		require.NoError(err)

		// 2. Ensure Kafka topic was NOT actually created
		topicDetails, err := s.kafkaAdminClient.ListTopics(ctx, topicName)
		require.NoError(err)
		require.Falsef(topicDetails.Has(topicName), fmt.Sprintf("topic %q should not exist", topicName))
	})

	t.Run("create topic with default request (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create one Topic via HTTP API
		type createTopicRequest struct {
			Name              string `json:"name"`
			PartitionCount    int    `json:"partition_count"`
			ReplicationFactor int    `json:"replication_factor"`
			Configs           []struct {
				Name  string `json:"name"`
				Value string `json:"value"`
			} `json:"configs"`
			ReplicaAssignments []struct {
				Partition int   `json:"partition"`
				Replicas  []int `json:"replicas"`
			} `json:"replica_assignments"`
		}

		topicName := "console-integration-test-valid-request-rest"
		partitionCount := 2
		httpReq := createTopicRequest{
			Name:              topicName,
			PartitionCount:    partitionCount,
			ReplicationFactor: 1,
			Configs: []struct {
				Name  string `json:"name"`
				Value string `json:"value"`
			}{
				{
					Name:  "cleanup.policy",
					Value: "compact",
				},
			},
		}

		type createTopicsResponse struct {
			TopicName         string `json:"topic_name"`
			PartitionCount    int    `json:"partition_count"`
			ReplicationFactor int    `json:"replication_factor"`
		}
		var httpRes createTopicsResponse
		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1/topics").
			BodyJSON(&httpReq).
			ToJSON(&httpRes).
			Post().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusCreated), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)
		assert.Equal(topicName, httpRes.TopicName)
		assert.Equal(partitionCount, httpRes.PartitionCount)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, topicName)
			assert.NoError(err)
		}()

		// 2. Ensure Kafka topic exists
		topicDetails, err := s.kafkaAdminClient.ListTopics(ctx, topicName)
		require.NoError(err)
		require.Truef(topicDetails.Has(topicName), fmt.Sprintf("topic %q should exist", topicName))
		topicsByName := topicDetails.TopicsSet()
		topicDetail := topicsByName[topicName]
		partitionCountReturned := len(topicDetail)
		assert.Equal(partitionCount, partitionCountReturned)

		// 3. Ensure that cleanup.policy is set for created topic
		resourceConfigs, err := s.kafkaAdminClient.DescribeTopicConfigs(ctx, topicName)
		require.NoError(err)
		resourceConfig, err := resourceConfigs.On(topicName, nil)
		require.NoError(err)
		require.NoError(resourceConfig.Err)

		foundCleanupPolicy := false
		for _, config := range resourceConfig.Configs {
			if config.Key != "cleanup.policy" {
				continue
			}
			foundCleanupPolicy = true
			assert.Equal(kmsg.ConfigSourceDynamicTopicConfig, config.Source)
			assert.Equal(kadm.StringPtr("compact"), config.Value)
		}
		assert.Truef(foundCleanupPolicy, "could not find cleanup.policy in config response")
	})

	t.Run("create topic with an invalid topic name (http)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create one topic via HTTP API
		type createTopicRequest struct {
			Name              string `json:"name"`
			PartitionCount    int    `json:"partition_count"`
			ReplicationFactor int    `json:"replication_factor"`
		}

		partitionCount := 2
		httpReq := createTopicRequest{
			Name:              "invalid_topic!name",
			PartitionCount:    partitionCount,
			ReplicationFactor: -1,
		}
		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1/topics").
			BodyJSON(&httpReq).
			Post().
			AddValidator(requests.ValidatorHandler(
				func(res *http.Response) error {
					assert.Equal(http.StatusBadRequest, res.StatusCode)
					if res.StatusCode == http.StatusCreated {
						return nil
					}
					return fmt.Errorf("unexpected status code: %d", res.StatusCode)
				},
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Error(err)
		assert.NotEmpty(errResponse)
		assert.Contains(errResponse, "INVALID_ARGUMENT")
		assert.Contains(errResponse, "name") // Check for field name
	})

	t.Run("try to create topic with a blank name (http)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Try sending a request with no payload via HTTP API
		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1/topics").
			Post().
			AddValidator(requests.ValidatorHandler(
				func(res *http.Response) error {
					assert.Equal(http.StatusBadRequest, res.StatusCode)
					if res.StatusCode == http.StatusCreated {
						return nil
					}
					return fmt.Errorf("unexpected status code: %d", res.StatusCode)
				},
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Error(err)
		assert.NotEmpty(errResponse)
		assert.Contains(errResponse, "INVALID_ARGUMENT")
		assert.Contains(errResponse, "name") // Check for field name
	})
}

func (s *APISuite) TestDeleteTopic_v1() {
	t := s.T()

	t.Run("delete topic with valid request (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create one Topic via Kafka API
		topicName := "console-integration-test-delete-topic-connect-go"
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, topicName)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, topicName)
			assert.NoError(err)
		}()

		// 2. Ensure that topic exists
		topicDetails, err := s.kafkaAdminClient.ListTopics(ctx, topicName)
		require.NoError(err)
		require.Len(topicDetails, 1)
		require.Truef(topicDetails.Has(topicName), "Topic should exist in response, but it doesn't")

		// 3. Delete topic via Connect API
		client := v1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		req := v1.DeleteTopicRequest{TopicName: topicName}
		_, err = client.DeleteTopic(ctx, connect.NewRequest(&req))
		require.NoError(err)

		// 4. Ensure that Kafka topic no longer exists
		topicDetails, err = s.kafkaAdminClient.ListTopics(ctx, topicName)
		require.NoError(err)
		assert.Falsef(topicDetails.Has(topicName), "Topic should no longer exist, but it still exists")
	})

	t.Run("delete topic with valid request (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create one Topic via Kafka API
		topicName := "console.integration_test-delete-topic-http1" // Dot, underscore, dash are allowed special chars
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, topicName)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, topicName)
			assert.NoError(err)
		}()

		// 2. Ensure that topic exists
		topicDetails, err := s.kafkaAdminClient.ListTopics(ctx, topicName)
		require.NoError(err)
		require.Len(topicDetails, 1)
		require.Truef(topicDetails.Has(topicName), "Topic should exist in response, but it doesn't")

		// 3. Delete topic via HTTP API
		urlPath := fmt.Sprintf("/v1/topics/%v", topicName)
		var errResponse string
		err = requests.
			URL(s.httpAddress() + urlPath).
			Delete().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusNoContent), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)

		// 4. Ensure that Kafka topic no longer exists
		topicDetails, err = s.kafkaAdminClient.ListTopics(ctx, topicName)
		require.NoError(err)
		assert.Falsef(topicDetails.Has(topicName), "Topic should no longer exist, but it still exists")
	})

	t.Run("try to delete a non-existent topic (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		client := v1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		req := v1.DeleteTopicRequest{TopicName: "some-random-topic-name-that-does-not-exist"}
		_, err := client.DeleteTopic(ctx, connect.NewRequest(&req))
		assert.Error(err)
		assert.Equal(connect.CodeNotFound.String(), connect.CodeOf(err).String())
	})

	t.Run("try to delete a non-existent topic (http)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		urlPath := "/v1/topics/some-random-topic-name-that-does-not-exist"
		var errResponse string
		err := requests.
			URL(s.httpAddress() + urlPath).
			Delete().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.NotEmpty(errResponse)
		assert.Contains(errResponse, "the requested topic does not exist")
		assert.Contains(errResponse, "RESOURCE_NOT_FOUND") // Actual enum value will be REASON_RESOURCE_NOT_FOUND
		assert.Error(err)
		assert.Truef(requests.HasStatusErr(err, http.StatusNotFound), "Status code should be 404")
	})

	t.Run("request topic deletion with invalid characters (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		client := v1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		req := v1.DeleteTopicRequest{TopicName: "some-chars-are-not!$-allowed"}
		_, err := client.DeleteTopic(ctx, connect.NewRequest(&req))
		assert.Error(err)
		assert.Equal(connect.CodeInvalidArgument.String(), connect.CodeOf(err).String())
	})

	t.Run("request topic deletion with invalid characters (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		urlPath := "/v1/topics/some-chars-are-not!$-allowed"
		var errResponse string
		err := requests.
			URL(s.httpAddress() + urlPath).
			Delete().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)

		require.Error(err)
		assert.Truef(requests.HasStatusErr(err, http.StatusBadRequest), "Status should be 400")
		assert.Contains(errResponse, "INVALID_ARGUMENT")
	})
}

func (s *APISuite) TestGetTopicConfiguration_v1() {
	t := s.T()

	t.Run("get topic configuration of a valid topic (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create new topic
		topicName := "console-integration-test-get-topic-config-valid-connect-go"
		topicConfigs := map[string]*string{
			"cleanup.policy":  kmsg.StringPtr("delete"),
			"retention.bytes": kmsg.StringPtr("1000"),
		}
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, topicConfigs, topicName)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, topicName)
			assert.NoError(err)
		}()

		// 2. Get Topic configuration
		client := v1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		req := &v1.GetTopicConfigurationsRequest{TopicName: topicName}
		response, err := client.GetTopicConfigurations(ctx, connect.NewRequest(req))
		require.NoError(err)

		var cleanupPolicyConfig *v1.Topic_Configuration
		var retentionBytesConfig *v1.Topic_Configuration
		for _, config := range response.Msg.Configurations {
			if config.Name == "cleanup.policy" {
				cleanupPolicyConfig = config
			}
			if config.Name == "retention.bytes" {
				retentionBytesConfig = config
			}
		}
		require.NotNilf(cleanupPolicyConfig, "Could not find cleanup.policy config in response")
		require.NotNilf(retentionBytesConfig, "Could not find retention.bytes config in response")
		assert.Equal(v1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG, cleanupPolicyConfig.Source)
		assert.Equal(v1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG, retentionBytesConfig.Source)
		assert.Equal(kmsg.StringPtr("delete"), cleanupPolicyConfig.Value)
		assert.Equal(kmsg.StringPtr("1000"), retentionBytesConfig.Value)
		assert.Equal(v1.ConfigType_CONFIG_TYPE_STRING.String(), cleanupPolicyConfig.Type.String())
		assert.Equal(v1.ConfigType_CONFIG_TYPE_LONG.String(), retentionBytesConfig.Type.String())
		assert.GreaterOrEqual(len(cleanupPolicyConfig.ConfigSynonyms), 1)
		assert.GreaterOrEqual(len(retentionBytesConfig.ConfigSynonyms), 1)
	})

	t.Run("get topic configuration of a non-existent topic (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		client := v1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		req := &v1.GetTopicConfigurationsRequest{TopicName: "does-not-exist"}
		_, err := client.GetTopicConfigurations(ctx, connect.NewRequest(req))
		assert.Error(err)
		assert.Equal(connect.CodeNotFound.String(), connect.CodeOf(err).String())
	})

	t.Run("get topic configuration of a bad topic name (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		client := v1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		req := &v1.GetTopicConfigurationsRequest{TopicName: "invalid-topic$-characters!"}
		_, err := client.GetTopicConfigurations(ctx, connect.NewRequest(req))
		assert.Error(err)
		assert.Equal(connect.CodeInvalidArgument.String(), connect.CodeOf(err).String())
	})

	t.Run("get topic configuration of a valid topic (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create new topic
		topicName := "console-integration-test-get-topic-config-valid-http"
		topicConfigs := map[string]*string{
			"cleanup.policy":  kmsg.StringPtr("delete"),
			"retention.bytes": kmsg.StringPtr("1000"),
		}
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, topicConfigs, topicName)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, topicName)
			assert.NoError(err)
		}()

		// 2. Retrieve topic config for topic
		type topicConfig struct {
			Name  string  `json:"name"`
			Value *string `json:"value"`
		}
		var httpRes struct {
			Configurations []topicConfig `json:"configurations"`
		}

		var errResponse string
		urlPath := fmt.Sprintf("/v1/topics/%v/configurations", topicName)
		err = requests.
			URL(s.httpAddress() + urlPath).
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			ToJSON(&httpRes).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)
		assert.GreaterOrEqual(len(httpRes.Configurations), 2)
	})

	t.Run("get topic configuration of a non-existent topic (http)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1/topics/does-not-exist/configurations").
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Error(err)
		assert.Truef(requests.HasStatusErr(err, http.StatusNotFound), "Response status code should be 404")
		assert.Contains(errResponse, "RESOURCE_NOT_FOUND")
	})
}

func (s *APISuite) TestUpdateTopicConfiguration_v1() {
	t := s.T()

	t.Run("update topic configuration of a valid topic (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create new topic
		topicName := "console-integration-test-update-topic-config-valid-connect-go"
		topicConfigs := map[string]*string{
			"cleanup.policy":   kmsg.StringPtr("delete"),
			"retention.bytes":  kmsg.StringPtr("1000"),
			"compression.type": kmsg.StringPtr("snappy"),
		}
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, topicConfigs, topicName)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, topicName)
			assert.NoError(err)
		}()

		// 2. Update two topic configs where one shall be removed and another set to a different value
		client := v1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		updateConfigReq := &v1.UpdateTopicConfigurationsRequest{
			TopicName: topicName,
			Configurations: []*v1.UpdateTopicConfigurationsRequest_UpdateConfiguration{
				{
					Name:      "cleanup.policy",
					Value:     nil,
					Operation: v1.ConfigAlterOperation_CONFIG_ALTER_OPERATION_DELETE,
				},
				{
					Name:      "compression.type",
					Value:     kmsg.StringPtr("producer"),
					Operation: v1.ConfigAlterOperation_CONFIG_ALTER_OPERATION_SET,
				},
			},
		}
		response, err := client.UpdateTopicConfigurations(ctx, connect.NewRequest(updateConfigReq))
		require.NoError(err)
		require.NotNil(response.Msg.Configurations)
		assert.GreaterOrEqual(len(response.Msg.Configurations), 10) // We expect at least 10 config props to be returned

		// 3. Compare the returned config values against our expectations
		var cleanupPolicyConfig *v1.Topic_Configuration
		var compressionTypeConfig *v1.Topic_Configuration
		var retentionBytesConfig *v1.Topic_Configuration
		for _, config := range response.Msg.Configurations {
			switch config.Name {
			case "cleanup.policy":
				cleanupPolicyConfig = config
			case "compression.type":
				compressionTypeConfig = config
			case "retention.bytes":
				retentionBytesConfig = config
			}
		}
		require.NotNil(cleanupPolicyConfig)
		require.NotNil(compressionTypeConfig)
		require.NotNil(retentionBytesConfig)

		assert.Equal("delete", *cleanupPolicyConfig.Value)
		assert.Equal(v1.ConfigSource_CONFIG_SOURCE_DEFAULT_CONFIG.String(), cleanupPolicyConfig.Source.String())

		assert.Equal(kmsg.StringPtr("producer"), compressionTypeConfig.Value)
		assert.Equal(v1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG.String(), compressionTypeConfig.Source.String())

		assert.Equal(kmsg.StringPtr("1000"), retentionBytesConfig.Value)
		assert.Equal(v1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG.String(), retentionBytesConfig.Source.String())
	})

	t.Run("update topic configuration of a valid topic (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create new topic
		topicName := "console-integration-test-update-topic-config-valid-http"
		topicConfigs := map[string]*string{
			"cleanup.policy":   kmsg.StringPtr("delete"),
			"retention.bytes":  kmsg.StringPtr("1000"),
			"compression.type": kmsg.StringPtr("snappy"),
		}
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, topicConfigs, topicName)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, topicName)
			assert.NoError(err)
		}()

		// 2. Update two topic configs where one shall be removed and another set to a different value
		type updateTopicConfigRequest struct {
			Name      string  `json:"name"`
			Value     *string `json:"value"`
			Operation string  `json:"operation"`
		}
		type updateTopicConfigResponse struct {
			ConfigSynonyms []any   `json:"config_synonyms"`
			Documentation  string  `json:"documentation"`
			ReadOnly       bool    `json:"read_only"`
			Sensitive      bool    `json:"sensitive"`
			Name           string  `json:"name"`
			Source         string  `json:"source"`
			Type           string  `json:"type"`
			Value          *string `json:"value"`
		}

		var httpRes struct {
			Configurations []updateTopicConfigResponse `json:"configurations"`
		}

		httpReq := []updateTopicConfigRequest{
			{
				Name:      "cleanup.policy",
				Value:     nil,
				Operation: "CONFIG_ALTER_OPERATION_DELETE",
			},
			{
				Name:      "compression.type",
				Value:     kmsg.StringPtr("producer"),
				Operation: "CONFIG_ALTER_OPERATION_SET",
			},
		}
		var errResponse string
		err = requests.
			URL(s.httpAddress() + fmt.Sprintf("/v1/topics/%v/configurations", topicName)).
			BodyJSON(&httpReq).
			ToJSON(&httpRes).
			Patch().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)
		require.NotNil(httpRes)
		assert.GreaterOrEqual(len(httpRes.Configurations), 10) // We expect at least 10 config props to be returned

		// 3. Compare the returned config values against our expectations
		var cleanupPolicyConfig *updateTopicConfigResponse
		var compressionTypeConfig *updateTopicConfigResponse
		var retentionBytesConfig *updateTopicConfigResponse
		for _, config := range httpRes.Configurations {
			copiedConfig := config
			switch config.Name {
			case "cleanup.policy":
				cleanupPolicyConfig = &copiedConfig
			case "compression.type":
				compressionTypeConfig = &copiedConfig
			case "retention.bytes":
				retentionBytesConfig = &copiedConfig
			}
		}
		require.NotNil(cleanupPolicyConfig)
		require.NotNil(compressionTypeConfig)
		require.NotNil(retentionBytesConfig)

		assert.Equal("delete", *cleanupPolicyConfig.Value)
		assert.Equal(v1.ConfigSource_CONFIG_SOURCE_DEFAULT_CONFIG.String(), cleanupPolicyConfig.Source)

		assert.Equal("producer", *compressionTypeConfig.Value)
		assert.Equal(v1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG.String(), compressionTypeConfig.Source)

		assert.Equal("1000", *retentionBytesConfig.Value)
		assert.Equal(v1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG.String(), retentionBytesConfig.Source)
	})

	t.Run("update topic configuration with invalid payload (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create new topic
		topicName := "console-integration-test-update-topic-config-invalid-connect-go"
		topicConfigs := map[string]*string{
			"cleanup.policy":   kmsg.StringPtr("delete"),
			"retention.bytes":  kmsg.StringPtr("1000"),
			"compression.type": kmsg.StringPtr("snappy"),
		}
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, topicConfigs, topicName)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, topicName)
			assert.NoError(err)
		}()

		// 2. Update two topic configs where one shall be removed and another set to a different value
		client := v1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		updateConfigReq := &v1.UpdateTopicConfigurationsRequest{
			TopicName: topicName,
			Configurations: []*v1.UpdateTopicConfigurationsRequest_UpdateConfiguration{
				{
					Name:      "cleanup.policy",
					Value:     kmsg.StringPtr("compact"), // Value must be empty for delete operation
					Operation: v1.ConfigAlterOperation_CONFIG_ALTER_OPERATION_DELETE,
				},
				{
					Name:      "compression.type",
					Value:     kmsg.StringPtr("producer"),
					Operation: v1.ConfigAlterOperation_CONFIG_ALTER_OPERATION_SET,
				},
			},
		}
		response, err := client.UpdateTopicConfigurations(ctx, connect.NewRequest(updateConfigReq))
		assert.Nil(response)
		require.Error(err)
		assert.Equal(connect.CodeInternal.String(), connect.CodeOf(err).String())
		assert.Contains(err.Error(), "cleanup.policy requires a value to be empty")
	})

	t.Run("update topic configuration for non existent topic (http)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		type updateTopicConfigRequest struct {
			Name      string  `json:"name"`
			Value     *string `json:"value"`
			Operation string  `json:"operation"`
		}
		httpReq := []updateTopicConfigRequest{
			{
				Name:      "cleanup.policy",
				Value:     nil,
				Operation: "CONFIG_ALTER_OPERATION_DELETE",
			},
		}

		var errResponse string
		err := requests.
			URL(s.httpAddress() + fmt.Sprintf("/v1/topics/%v/configurations", "does-not-exist")).
			Patch().
			BodyJSON(&httpReq).
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.NotEmpty(errResponse)
		assert.Contains(errResponse, "REASON_RESOURCE_NOT_FOUND") // Topic does not exist
		assert.Error(err)
	})

	t.Run("update topic configuration with empty payload (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create new topic
		topicName := "console-integration-test-update-topic-config-empty-payload-http"
		topicConfigs := map[string]*string{
			"cleanup.policy":   kmsg.StringPtr("delete"),
			"retention.bytes":  kmsg.StringPtr("1000"),
			"compression.type": kmsg.StringPtr("snappy"),
		}
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, topicConfigs, topicName)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, topicName)
			assert.NoError(err)
		}()

		// 2. Send patch config request without any payload for an existing topic
		var errResponse string
		err = requests.
			URL(s.httpAddress() + fmt.Sprintf("/v1/topics/%v/configurations", topicName)).
			Patch().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.NotEmpty(errResponse)
		assert.Contains(errResponse, "REASON_INVALID_INPUT")
		assert.Error(err)
	})
}

func (s *APISuite) TestSetTopicConfiguration_v1() {
	t := s.T()

	t.Run("set topic configuration of a valid topic (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create new topic
		topicName := "console-integration-test-update-topic-config-valid-connect-go"
		topicConfigs := map[string]*string{
			"cleanup.policy":   kmsg.StringPtr("delete"),
			"retention.bytes":  kmsg.StringPtr("1000"),
			"compression.type": kmsg.StringPtr("snappy"),
		}
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, topicConfigs, topicName)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, topicName)
			assert.NoError(err)
		}()

		// 2. Update two topic configs where one shall be removed and another set to a different value
		client := v1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		setConfigReq := &v1.SetTopicConfigurationsRequest{
			TopicName: topicName,
			Configurations: []*v1.SetTopicConfigurationsRequest_SetConfiguration{
				{
					Name:  "cleanup.policy",
					Value: kmsg.StringPtr("delete"),
				},
				{
					Name:  "compression.type",
					Value: kmsg.StringPtr("producer"),
				},
			},
		}
		response, err := client.SetTopicConfigurations(ctx, connect.NewRequest(setConfigReq))
		require.NoError(err)
		require.NotNil(response.Msg.Configurations)
		assert.GreaterOrEqual(len(response.Msg.Configurations), 10) // We expect at least 10 config props to be returned

		// 3. Compare the returned config values against our expectations
		var cleanupPolicyConfig *v1.Topic_Configuration
		var compressionTypeConfig *v1.Topic_Configuration
		var retentionBytesConfig *v1.Topic_Configuration
		for _, config := range response.Msg.Configurations {
			switch config.Name {
			case "cleanup.policy":
				cleanupPolicyConfig = config
			case "compression.type":
				compressionTypeConfig = config
			case "retention.bytes":
				retentionBytesConfig = config
			}
		}
		require.NotNil(cleanupPolicyConfig)
		require.NotNil(compressionTypeConfig)
		require.NotNil(retentionBytesConfig)

		assert.Equal("delete", *cleanupPolicyConfig.Value)
		assert.Equal(v1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG.String(), cleanupPolicyConfig.Source.String())

		assert.Equal(kmsg.StringPtr("producer"), compressionTypeConfig.Value)
		assert.Equal(v1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG.String(), compressionTypeConfig.Source.String())

		assert.Equal(v1.ConfigSource_CONFIG_SOURCE_DEFAULT_CONFIG.String(), retentionBytesConfig.Source.String())
	})

	t.Run("set topic configuration of a valid topic (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create new topic
		topicName := "console-integration-test-update-topic-config-valid-http"
		topicConfigs := map[string]*string{
			"cleanup.policy":   kmsg.StringPtr("delete"),
			"retention.bytes":  kmsg.StringPtr("1000"),
			"compression.type": kmsg.StringPtr("snappy"),
		}
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, topicConfigs, topicName)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, topicName)
			assert.NoError(err)
		}()

		// 2. Update two topic configs where one shall be removed and another set to a different value
		type setTopicConfigRequest struct {
			Name  string  `json:"name"`
			Value *string `json:"value"`
		}
		type setTopicConfigResponse struct {
			ConfigSynonyms []any   `json:"config_synonyms"`
			Documentation  string  `json:"documentation"`
			ReadOnly       bool    `json:"read_only"`
			Sensitive      bool    `json:"sensitive"`
			Name           string  `json:"name"`
			Source         string  `json:"source"`
			Type           string  `json:"type"`
			Value          *string `json:"value"`
		}

		var httpRes struct {
			Configurations []setTopicConfigResponse `json:"configurations"`
		}

		httpReq := []setTopicConfigRequest{
			{
				Name:  "cleanup.policy",
				Value: kmsg.StringPtr("delete"),
			},
			{
				Name:  "compression.type",
				Value: kmsg.StringPtr("producer"),
			},
		}

		var errResponse string
		err = requests.
			URL(s.httpAddress() + fmt.Sprintf("/v1/topics/%v/configurations", topicName)).
			BodyJSON(&httpReq).
			ToJSON(&httpRes).
			Put().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)
		require.NotNil(httpRes)
		assert.GreaterOrEqual(len(httpRes.Configurations), 10) // We expect at least 10 config props to be returned

		// 3. Compare the returned config values against our expectations
		var cleanupPolicyConfig *setTopicConfigResponse
		var compressionTypeConfig *setTopicConfigResponse
		var retentionBytesConfig *setTopicConfigResponse
		for _, config := range httpRes.Configurations {
			copiedConfig := config
			switch config.Name {
			case "cleanup.policy":
				cleanupPolicyConfig = &copiedConfig
			case "compression.type":
				compressionTypeConfig = &copiedConfig
			case "retention.bytes":
				retentionBytesConfig = &copiedConfig
			}
		}
		require.NotNil(cleanupPolicyConfig)
		require.NotNil(compressionTypeConfig)
		require.NotNil(retentionBytesConfig)

		assert.Equal("delete", *cleanupPolicyConfig.Value)
		assert.Equal(v1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG.String(), cleanupPolicyConfig.Source)

		assert.Equal("producer", *compressionTypeConfig.Value)
		assert.Equal(v1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG.String(), compressionTypeConfig.Source)

		assert.Equal(v1.ConfigSource_CONFIG_SOURCE_DEFAULT_CONFIG.String(), retentionBytesConfig.Source)
	})

	t.Run("set topic configuration with an invalid request (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create new topic
		topicName := "console-integration-test-update-topic-config-invalid-connect-go"
		topicConfigs := map[string]*string{
			"cleanup.policy":   kmsg.StringPtr("delete"),
			"retention.bytes":  kmsg.StringPtr("1000"),
			"compression.type": kmsg.StringPtr("snappy"),
		}
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, topicConfigs, topicName)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, topicName)
			assert.NoError(err)
		}()

		// 2. Send alter config request with invalid config key
		client := v1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		setConfigReq := &v1.SetTopicConfigurationsRequest{
			TopicName: topicName,
			Configurations: []*v1.SetTopicConfigurationsRequest_SetConfiguration{
				{
					Name:  "key-doesnt-exist",
					Value: kmsg.StringPtr("delete"),
				},
			},
		}
		response, err := client.SetTopicConfigurations(ctx, connect.NewRequest(setConfigReq))
		assert.Error(err)
		assert.Nil(response)
		assert.Equal(connect.CodeInternal.String(), connect.CodeOf(err).String())
	})

	t.Run("set topic configuration for a non existent topic (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 2. Send alter config request with invalid config key
		client := v1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		setConfigReq := &v1.SetTopicConfigurationsRequest{
			TopicName: "topic-does-not-exist",
			Configurations: []*v1.SetTopicConfigurationsRequest_SetConfiguration{
				{
					Name:  "cleanup.policy",
					Value: kmsg.StringPtr("delete"),
				},
			},
		}
		response, err := client.SetTopicConfigurations(ctx, connect.NewRequest(setConfigReq))
		assert.Error(err)
		assert.Nil(response)
		assert.Equal(connect.CodeNotFound.String(), connect.CodeOf(err).String())
	})

	t.Run("set topic configuration for a non existent topic (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 2. Update two topic configs where one shall be removed and another set to a different value
		type setTopicConfigRequest struct {
			Name  string  `json:"name"`
			Value *string `json:"value"`
		}
		httpReq := []setTopicConfigRequest{
			{
				Name:  "cleanup.policy",
				Value: kmsg.StringPtr("delete"),
			},
		}

		var errResponse string
		err := requests.
			URL(s.httpAddress() + fmt.Sprintf("/v1/topics/%v/configurations", "topic-does-not-exist")).
			BodyJSON(&httpReq).
			Put().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.NotEmpty(errResponse)
		require.Error(err)
		assert.Contains(errResponse, "RESOURCE_NOT_FOUND")
		assert.Truef(requests.HasStatusErr(err, http.StatusNotFound), "Status code should be 404")
	})
}
