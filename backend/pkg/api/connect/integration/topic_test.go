// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package integration

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/carlmjohnson/requests"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kmsg"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	v1alpha1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
)

func (s *APISuite) TestCreateTopic() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	t.Run("create topic with valid request (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create Topic via Connect API call
		topicName := "console-integration-test-valid-request-connect-go"
		partitionCount := int32(2)
		client := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		createReq := &v1alpha1.CreateTopicRequest{
			Topic: &v1alpha1.CreateTopicRequest_Topic{
				Name:              topicName,
				PartitionCount:    &partitionCount,
				ReplicationFactor: nil, // Default
				Configs: []*v1alpha1.CreateTopicRequest_Topic_Config{
					{
						Name:  "cleanup.policy",
						Value: kadm.StringPtr("compact"),
					},
				},
			},
		}
		_, err := client.CreateTopic(ctx, connect.NewRequest(createReq))
		require.NoError(err)

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
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		// Try tp create Topic via Connect API call
		topicName := "console-integration-test-bad-topic-name!"
		client := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		createReq := &v1alpha1.CreateTopicRequest{
			Topic: &v1alpha1.CreateTopicRequest_Topic{
				Name: topicName,
			},
		}
		_, err := client.CreateTopic(ctx, connect.NewRequest(createReq))
		require.Error(err)
		assert.Equalf(connect.CodeInvalidArgument.String(), connect.CodeOf(err).String(), "connect error code must be 'INVALID_ARGUMENT'")
	})

	t.Run("create topic in dry-run (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Start dry-run of create topic via Connect API call
		topicName := "console-integration-test-dry-run-request-connect-go"
		partitionCount := int32(2)
		client := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		createReq := &v1alpha1.CreateTopicRequest{
			Topic: &v1alpha1.CreateTopicRequest_Topic{
				Name:              topicName,
				PartitionCount:    &partitionCount,
				ReplicationFactor: nil, // Default
				Configs: []*v1alpha1.CreateTopicRequest_Topic_Config{
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
			ReplicaAssignment []struct {
				Partition int   `json:"partition"`
				Replicas  []int `json:"replicas"`
			} `json:"replica_assignment"`
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
		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1alpha1/topics").
			BodyJSON(&httpReq).
			Post().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusCreated), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)

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
			URL(s.httpAddress() + "/v1alpha1/topics").
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

	t.Run("try to create topic with an empty topic (http)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Try sending a request with no payload via HTTP API
		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1alpha1/topics").
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

func (s *APISuite) TestDeleteTopic() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	t.Run("delete topic with valid request (connect-go)", func(t *testing.T) {
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
		client := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		req := v1alpha1.DeleteTopicRequest{Name: topicName}
		_, err = client.DeleteTopic(ctx, connect.NewRequest(&req))
		require.NoError(err)

		// 4. Ensure that Kafka topic no longer exists
		topicDetails, err = s.kafkaAdminClient.ListTopics(ctx, topicName)
		require.NoError(err)
		assert.Falsef(topicDetails.Has(topicName), "Topic should no longer exist, but it still exists")
	})

	t.Run("delete topic with valid request (http)", func(t *testing.T) {
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
		urlPath := fmt.Sprintf("/v1alpha1/topics/%v", topicName)
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
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		client := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		req := v1alpha1.DeleteTopicRequest{Name: "some-random-topic-name-that-does-not-exist"}
		_, err := client.DeleteTopic(ctx, connect.NewRequest(&req))
		assert.Error(err)
		assert.Equal(connect.CodeNotFound.String(), connect.CodeOf(err).String())
	})

	t.Run("try to delete a non-existent topic (http)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		urlPath := "/v1alpha1/topics/some-random-topic-name-that-does-not-exist"
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
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		client := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		req := v1alpha1.DeleteTopicRequest{Name: "some-chars-are-not!$-allowed"}
		_, err := client.DeleteTopic(ctx, connect.NewRequest(&req))
		assert.Error(err)
		assert.Equal(connect.CodeInvalidArgument.String(), connect.CodeOf(err).String())
	})

	t.Run("request topic deletion with invalid characters (http)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		urlPath := "/v1alpha1/topics/some-chars-are-not!$-allowed"
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

func (s *APISuite) TestGetTopicConfiguration() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	t.Run("get topic configuration of a valid topic (connect-go)", func(t *testing.T) {
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
		client := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		req := &v1alpha1.GetTopicConfigurationsRequest{TopicName: topicName}
		response, err := client.GetTopicConfigurations(ctx, connect.NewRequest(req))
		require.NoError(err)

		var cleanupPolicyConfig *v1alpha1.Topic_Configuration
		var retentionBytesConfig *v1alpha1.Topic_Configuration
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
		assert.Equal(v1alpha1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG, cleanupPolicyConfig.Source)
		assert.Equal(v1alpha1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG, retentionBytesConfig.Source)
		assert.Equal(kmsg.StringPtr("delete"), cleanupPolicyConfig.Value)
		assert.Equal(kmsg.StringPtr("1000"), retentionBytesConfig.Value)
		assert.Equal(v1alpha1.ConfigType_CONFIG_TYPE_STRING.String(), cleanupPolicyConfig.Type.String())
		assert.Equal(v1alpha1.ConfigType_CONFIG_TYPE_LONG.String(), retentionBytesConfig.Type.String())
		assert.GreaterOrEqual(len(cleanupPolicyConfig.ConfigSynonyms), 1)
		assert.GreaterOrEqual(len(retentionBytesConfig.ConfigSynonyms), 1)
	})

	t.Run("get topic configuration of a non-existent topic (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		client := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		req := &v1alpha1.GetTopicConfigurationsRequest{TopicName: "does-not-exist"}
		_, err := client.GetTopicConfigurations(ctx, connect.NewRequest(req))
		assert.Error(err)
		assert.Equal(connect.CodeNotFound.String(), connect.CodeOf(err).String())
	})

	t.Run("get topic configuration of a bad topic name (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		client := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		req := &v1alpha1.GetTopicConfigurationsRequest{TopicName: "invalid-topic$-characters!"}
		_, err := client.GetTopicConfigurations(ctx, connect.NewRequest(req))
		assert.Error(err)
		assert.Equal(connect.CodeInvalidArgument.String(), connect.CodeOf(err).String())
	})

	t.Run("get topic configuration of a valid topic (http)", func(t *testing.T) {
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
		var httpRes []topicConfig

		var errResponse string
		urlPath := fmt.Sprintf("/v1alpha1/topics/%v/configurations", topicName)
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
		assert.GreaterOrEqual(len(httpRes), 2)
	})

	t.Run("get topic configuration of a non-existent topic (http)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1alpha1/topics/does-not-exist/configurations").
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

func (s *APISuite) TestUpdateTopicConfiguration() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	t.Run("update topic configuration of a valid topic (connect-go)", func(t *testing.T) {
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
		client := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		updateConfigReq := &v1alpha1.UpdateTopicConfigurationsRequest{
			TopicName: topicName,
			Configurations: []*v1alpha1.UpdateTopicConfigurationsRequest_UpdateConfiguration{
				{
					Key:       "cleanup.policy",
					Value:     nil,
					Operation: v1alpha1.ConfigAlterOperation_CONFIG_ALTER_OPERATION_DELETE,
				},
				{
					Key:       "compression.type",
					Value:     kmsg.StringPtr("producer"),
					Operation: v1alpha1.ConfigAlterOperation_CONFIG_ALTER_OPERATION_SET,
				},
			},
		}
		response, err := client.UpdateTopicConfigurations(ctx, connect.NewRequest(updateConfigReq))
		require.NoError(err)
		require.NotNil(response.Msg.Configurations)
		assert.GreaterOrEqual(len(response.Msg.Configurations), 10) // We expect at least 10 config props to be returned

		// 3. Compare the returned config values against our expectations
		var cleanupPolicyConfig *v1alpha1.Topic_Configuration
		var compressionTypeConfig *v1alpha1.Topic_Configuration
		var retentionBytesConfig *v1alpha1.Topic_Configuration
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
		assert.Equal(v1alpha1.ConfigSource_CONFIG_SOURCE_DEFAULT_CONFIG.String(), cleanupPolicyConfig.Source.String())

		assert.Equal(kmsg.StringPtr("producer"), compressionTypeConfig.Value)
		assert.Equal(v1alpha1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG.String(), compressionTypeConfig.Source.String())

		assert.Equal(kmsg.StringPtr("1000"), retentionBytesConfig.Value)
		assert.Equal(v1alpha1.ConfigSource_CONFIG_SOURCE_DYNAMIC_TOPIC_CONFIG.String(), retentionBytesConfig.Source.String())
	})

	t.Run("update topic configuration of a valid topic (http)", func(t *testing.T) {
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
			Key       string  `json:"key"`
			Value     *string `json:"value"`
			Operation string  `json:"operation"`
		}
		type updateTopicConfigResponse struct {
			ConfigSynonyms []any  `json:"config_synonyms"`
			Documentation  string `json:"documentation"`
			IsReadOnly     bool   `json:"is_read_only"`
			IsSensitive    bool   `json:"is_sensitive"`
			Name           string `json:"name"`
			Source         string `json:"source"`
			Type           string `json:"type"`
			Value          string `json:"value"`
		}

		var httpRes []updateTopicConfigResponse
		httpReq := []updateTopicConfigRequest{
			{
				Key:       "cleanup.policy",
				Value:     nil,
				Operation: "CONFIG_ALTER_OPERATION_DELETE",
			},
			{
				Key:       "compression.type",
				Value:     kmsg.StringPtr("producer"),
				Operation: "CONFIG_ALTER_OPERATION_SET",
			},
		}
		var errResponse string
		err = requests.
			URL(s.httpAddress() + fmt.Sprintf("/v1alpha1/topics/%v/configurations", topicName)).
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
	})
}
