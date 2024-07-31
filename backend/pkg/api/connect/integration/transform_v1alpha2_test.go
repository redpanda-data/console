// Copyright 2024 Redpanda Data, Inc.
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
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/url"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/carlmjohnson/requests"
	adminapi "github.com/redpanda-data/common-go/rpadmin"
	assertpkg "github.com/stretchr/testify/assert"
	requirepkg "github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"

	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
	v1alpha2connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2/dataplanev1alpha2connect"
)

// DirectDeployAndTestTransform encapsulates the logic for creating a transform and asserting its successful creation.
func (s *APISuite) TestDeployTransform_v1alpha2() {
	t := s.T()

	type KeyVal struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}

	type deployTransformRequest struct {
		Name                 string   `json:"name"`
		InputTopicName       string   `json:"input_topic_name"`
		OutputTopicNames     []string `json:"output_topic_names"`
		EnvironmentVariables []KeyVal `json:"environment_variables"`
	}

	t.Run("deploy transform with valid request (http)", func(t *testing.T) {
		require := requirepkg.New(t)
		assert := assertpkg.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 24*time.Second)
		defer cancel()

		tfName := "test-valid-identity-transform"
		inputTopicName := "wasm-tfm-create-test-input"
		outputTopicName := "wasm-tfm-create-test-output"

		// Create input and output topics
		require.NoError(createKafkaTopic(ctx, s.kafkaAdminClient, inputTopicName, 2))
		require.NoError(createKafkaTopic(ctx, s.kafkaAdminClient, outputTopicName, 3))

		t.Cleanup(func() {
			cleanupCtx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			assert.NoError(deleteTransform(cleanupCtx, s.redpandaAdminClient, tfName))
			assert.NoError(deleteKafkaTopic(cleanupCtx, s.kafkaAdminClient, inputTopicName))
			assert.NoError(deleteKafkaTopic(cleanupCtx, s.kafkaAdminClient, outputTopicName))
		})

		// 1. Create request body/payload
		// Prepare the multipart request with transform metadata and wasm binary
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)

		deployRequestMetadata := deployTransformRequest{
			Name:                 tfName,
			InputTopicName:       inputTopicName,
			OutputTopicNames:     []string{outputTopicName},
			EnvironmentVariables: []KeyVal{{Key: "foo", Value: "bar"}},
		}

		metadataPart, err := writer.CreateFormField("metadata")
		require.NoError(err)
		require.NoError(json.NewEncoder(metadataPart).Encode(deployRequestMetadata))

		wasmPart, err := writer.CreateFormFile("wasm_binary", "transform.wasm")
		require.NoError(err)

		_, err = wasmPart.Write(identityTransform)
		require.NoError(err)

		require.NoError(writer.Close())

		// 2. Send request and parse response
		type partitionTransformStatus struct {
			BrokerID  int    `json:"broker_id"`
			Partition int    `json:"partition"`
			Statuses  string `json:"status"`
			Lag       int    `json:"lag"`
		}
		type deployTransformResponse struct {
			Name             string                     `json:"name"`
			InputTopicName   string                     `json:"input_topic_name"`
			OutputTopicNames []string                   `json:"output_topic_names"`
			Statuses         []partitionTransformStatus `json:"statuses"`
		}

		var httpRes deployTransformResponse
		var errResponse string
		err = requests.
			URL(s.httpAddress() + "/v1alpha2/transforms").
			BodyBytes(body.Bytes()).
			ContentType(writer.FormDataContentType()).
			ToJSON(&httpRes).
			Put().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusCreated), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)

		// 3. Compare response against expected
		assert.Equal(tfName, httpRes.Name)
		assert.Equal(inputTopicName, httpRes.InputTopicName)
		assert.Equal([]string{outputTopicName}, httpRes.OutputTopicNames)

		// We need to wait a bit before producing records so that the transform
		// is ready and won't miss messages. It's not clear what we would need
		// to await to get rid of this sleep. One second was not enough.
		time.Sleep(5 * time.Second)

		// 4. Produce one message into input topic
		recordKey := []byte("test-key")
		recordValue := []byte("integration-test-value")
		produceResults := s.kafkaClient.ProduceSync(ctx, &kgo.Record{
			Key:   recordKey,
			Value: recordValue,
			Topic: inputTopicName,
		})
		require.NoError(produceResults.FirstErr())

		// 5. The transform is supposed to write the records produced to inputTopicName
		// into the configured output topic. We'll validate this now.
		consumerOpts := append(s.kafkaClient.Opts(), kgo.ConsumeTopics(outputTopicName))
		kafkaConsumerCl, err := kgo.NewClient(consumerOpts...)
		require.NoError(err)

		consumeCtx, cancel := context.WithTimeoutCause(ctx, 6*time.Second, fmt.Errorf("consumer context deadline exceeded"))
		defer cancel()
		fetches := kafkaConsumerCl.PollRecords(consumeCtx, 1)
		assert.Empty(fetches.Errors(), "unexpected errors when polling record in output topic")
		require.GreaterOrEqual(len(fetches.Records()), 1)

		fetchedRecord := fetches.Records()[0]
		assert.Equal(recordKey, fetchedRecord.Key)
		assert.Equal(recordValue, fetchedRecord.Value)
	})

	t.Run("try to deploy transform with an invalid request - incomplete metadata (http)", func(t *testing.T) {
		require := requirepkg.New(t)
		assert := assertpkg.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)

		inputTopicName := "wasm-tfm-create-test-i"
		deployRequestMetadata := deployTransformRequest{
			Name:             "deploy-transform-incomplete-metadata",
			InputTopicName:   inputTopicName,
			OutputTopicNames: nil, // This should be flagged
		}

		metadataPart, err := writer.CreateFormField("metadata")
		require.NoError(err)
		require.NoError(json.NewEncoder(metadataPart).Encode(deployRequestMetadata))

		wasmPart, err := writer.CreateFormFile("wasm_binary", "transform.wasm")
		require.NoError(err)

		_, err = wasmPart.Write(identityTransform)
		require.NoError(err)

		require.NoError(writer.Close())

		var errResponse string
		err = requests.
			URL(s.httpAddress() + "/v1alpha2/transforms").
			Put().
			BodyBytes(body.Bytes()).
			ContentType(writer.FormDataContentType()).
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusCreated), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		require.Error(err)
		assert.NotEmpty(errResponse)
		assert.Truef(requests.HasStatusErr(err, http.StatusBadRequest), "Expected response status to be 400 (BAD REQUEST)")
		assert.Contains(errResponse, "REASON_INVALID_INPUT")
		assert.Contains(errResponse, "output_topic_names")
	})

	t.Run("try to deploy transform with an invalid request - protected env var (http)", func(t *testing.T) {
		require := requirepkg.New(t)
		assert := assertpkg.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)

		inputTopicName := "wasm-tfm-create-test-i"
		deployRequestMetadata := deployTransformRequest{
			Name:             "deploy-transform-incomplete-metadata",
			InputTopicName:   inputTopicName,
			OutputTopicNames: []string{"some-random-topic"},
			EnvironmentVariables: []KeyVal{{
				Key:   "REDPANDA_KEYS_ARE_PROTECTED", // This should be flagged
				Value: "bar",
			}},
		}

		metadataPart, err := writer.CreateFormField("metadata")
		require.NoError(err)
		require.NoError(json.NewEncoder(metadataPart).Encode(deployRequestMetadata))

		wasmPart, err := writer.CreateFormFile("wasm_binary", "transform.wasm")
		require.NoError(err)

		_, err = wasmPart.Write(identityTransform)
		require.NoError(err)

		require.NoError(writer.Close())

		var errResponse string
		err = requests.
			URL(s.httpAddress() + "/v1alpha2/transforms").
			Put().
			BodyBytes(body.Bytes()).
			ContentType(writer.FormDataContentType()).
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusCreated), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		require.Error(err)
		assert.NotEmpty(errResponse)
		assert.Truef(requests.HasStatusErr(err, http.StatusBadRequest), "Expected response status to be 400 (BAD REQUEST)")
		assert.Contains(errResponse, "REASON_INVALID_INPUT")
		assert.Contains(errResponse, "reserved")
	})

	t.Run("try to deploy transform with an invalid request - no wasm binary (http)", func(t *testing.T) {
		require := requirepkg.New(t)
		assert := assertpkg.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)

		inputTopicName := "wasm-tfm-create-test-i"
		deployRequestMetadata := deployTransformRequest{
			Name:             "deploy-transform-incomplete-metadata",
			InputTopicName:   inputTopicName,
			OutputTopicNames: []string{"some-random-topic"},
		}

		metadataPart, err := writer.CreateFormField("metadata")
		require.NoError(err)
		require.NoError(json.NewEncoder(metadataPart).Encode(deployRequestMetadata))

		require.NoError(writer.Close())

		var errResponse string
		err = requests.
			URL(s.httpAddress() + "/v1alpha2/transforms").
			Put().
			BodyBytes(body.Bytes()).
			ContentType(writer.FormDataContentType()).
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusCreated), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		require.Error(err)
		assert.NotEmpty(errResponse)
		assert.Truef(requests.HasStatusErr(err, http.StatusBadRequest), "Expected response status to be 400 (BAD REQUEST)")
		assert.Contains(errResponse, "REASON_INVALID_INPUT")
		assert.Contains(errResponse, "could not find or parse form field wasm_binary")
	})

	t.Run("try to deploy transform with an invalid request - no request body (http)", func(t *testing.T) {
		require := requirepkg.New(t)
		assert := assertpkg.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1alpha2/transforms").
			Put().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusCreated), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		require.Error(err)
		assert.NotEmpty(errResponse)
		assert.Truef(requests.HasStatusErr(err, http.StatusBadRequest), "Expected response status to be 400 (BAD REQUEST)")
		assert.Contains(errResponse, "sent body is empty")
	})

	t.Run("try to deploy transform with an error reported back by Redpanda (http)", func(t *testing.T) {
		require := requirepkg.New(t)
		assert := assertpkg.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// This team we try to deploy a WASM transform for something that the API does not validate
		// and is invalid. We want to test whether we properly report back Admin API errors.

		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1alpha2/transforms").
			Put().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusCreated), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		require.Error(err)
		assert.NotEmpty(errResponse)
		assert.Truef(requests.HasStatusErr(err, http.StatusBadRequest), "Expected response status to be 400 (BAD REQUEST)")
	})
}

func (s *APISuite) TestGetTransform_v1alpha2() {
	t := s.T()

	assert := assertpkg.New(t)
	require := requirepkg.New(t)

	tfName := "test-get-tf"
	inputTopicName := "wasm-tfm-create-test-c"
	outputTopicName := "wasm-tfm-create-test-d"

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	t.Cleanup(cancel)

	// Create pre-requisites for getting the transform
	transformClient := v1alpha2connect.NewTransformServiceClient(http.DefaultClient, s.httpAddress())
	require.NoError(createKafkaTopic(ctx, s.kafkaAdminClient, inputTopicName, 2))
	require.NoError(createKafkaTopic(ctx, s.kafkaAdminClient, outputTopicName, 3))

	t.Cleanup(func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
		defer cancel()
		assert.NoError(deleteKafkaTopic(cleanupCtx, s.kafkaAdminClient, inputTopicName))
		assert.NoError(deleteKafkaTopic(cleanupCtx, s.kafkaAdminClient, outputTopicName))
	})

	r, err := createTransform(ctx, s.redpandaAdminClient, adminapi.TransformMetadata{
		Name:         tfName,
		InputTopic:   inputTopicName,
		OutputTopics: []string{outputTopicName},
		Environment:  []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}},
	}, identityTransform)
	require.NoError(err)
	assert.Equal(tfName, r.Name)
	assert.Equal(inputTopicName, r.InputTopic)
	assert.Equal([]string{outputTopicName}, r.OutputTopics)

	t.Cleanup(func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
		defer cancel()
		assert.NoError(deleteTransform(cleanupCtx, s.redpandaAdminClient, tfName))
	})

	t.Run("get transform with valid request (connect-go)", func(t *testing.T) {
		assert := assertpkg.New(t)
		require := requirepkg.New(t)

		ctx, cancel := context.WithTimeout(ctx, 6*time.Second)
		t.Cleanup(cancel)

		msg, err := transformClient.GetTransform(ctx, connect.NewRequest(&v1alpha2.GetTransformRequest{
			Name: tfName,
		}))
		assert.NoError(err)

		assert.Equal(tfName, msg.Msg.Transform.Name)
		assert.Equal(inputTopicName, msg.Msg.Transform.InputTopicName)
		assert.Equal([]string{outputTopicName}, msg.Msg.Transform.OutputTopicNames)
		require.Len(msg.Msg.Transform.EnvironmentVariables, 1)
		envVar := msg.Msg.Transform.EnvironmentVariables[0]
		assert.Equal("foo", envVar.Key)
		assert.Equal("bar", envVar.Value)
	})

	t.Run("get transform with valid request (http)", func(t *testing.T) {
		assert := assertpkg.New(t)
		require := requirepkg.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		type partitionTransformStatus struct {
			BrokerID    int32  `json:"broker_id"`
			PartitionID int32  `json:"partition_id"`
			Statuses    string `json:"status"`
		}
		type envVar struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		}
		type getTransformResponse struct {
			Name                 string                     `json:"name"`
			InputTopicName       string                     `json:"input_topic_name"`
			OutputTopicNames     []string                   `json:"output_topic_names"`
			Statuses             []partitionTransformStatus `json:"statuses"`
			EnvironmentVariables []envVar                   `json:"environment_variables"`
		}
		var httpRes getTransformResponse
		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1alpha2/transforms/" + tfName).
			ToJSON(&httpRes).
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)

		assert.Equal(tfName, httpRes.Name)
		assert.Equal(inputTopicName, httpRes.InputTopicName)
		assert.Equal([]string{outputTopicName}, httpRes.OutputTopicNames)
		require.Len(httpRes.EnvironmentVariables, 1)
		keyVal := httpRes.EnvironmentVariables[0]
		assert.Equal("foo", keyVal.Key)
		assert.Equal("bar", keyVal.Value)
	})

	t.Run("get transform with special chars in name - valid request (http)", func(t *testing.T) {
		// Skip this test, until https://github.com/redpanda-data/redpanda/issues/16643 is fixed.
		t.Skip()

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		transformNameWithSpecialChars := "some-transform/name that&requires! encoding"
		_, err := createTransform(ctx, s.redpandaAdminClient, adminapi.TransformMetadata{
			Name:         transformNameWithSpecialChars,
			InputTopic:   inputTopicName,
			OutputTopics: []string{outputTopicName},
			Environment:  []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}},
		}, identityTransform)
		require.NoError(err)
		t.Cleanup(func() {
			cleanupCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			assert.NoError(deleteTransform(cleanupCtx, s.redpandaAdminClient, transformNameWithSpecialChars))
		})

		// We'll only check whether the returned name matches, we don't care about the
		// other returned properties as they are already validated in another test.
		type getTransformResponse struct {
			Name string `json:"name"`
		}
		var httpRes getTransformResponse
		var errResponse string
		err = requests.
			URL(s.httpAddress() + "/v1alpha2/transforms/" + url.PathEscape(transformNameWithSpecialChars)).
			ToJSON(&httpRes).
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)
		assert.Equal(transformNameWithSpecialChars, httpRes.Name)
	})

	t.Run("get non-existent transform (connect-go)", func(t *testing.T) {
		assert := assertpkg.New(t)

		ctx, cancel := context.WithTimeout(ctx, 6*time.Second)
		t.Cleanup(cancel)

		msg, err := transformClient.GetTransform(ctx, connect.NewRequest(&v1alpha2.GetTransformRequest{
			Name: "does-not-exist",
		}))
		assert.Nil(msg)
		assert.Error(err)
		assert.Equal(connect.CodeNotFound.String(), connect.CodeOf(err).String())
		assert.Contains(err.Error(), "does not exist")
	})

	t.Run("get non-existent transform (http)", func(t *testing.T) {
		assert := assertpkg.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
		t.Cleanup(cancel)

		var httpRes string
		var errResponse string
		err = requests.
			URL(s.httpAddress() + "/v1alpha2/transforms/" + "does-not-exist").
			ToJSON(&httpRes).
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Error(err)
		assert.Truef(requests.HasStatusErr(err, http.StatusNotFound), "Status code should be 404")
		assert.Contains(errResponse, "does not exist")
		assert.Contains(errResponse, "REASON_RESOURCE_NOT_FOUND")
	})

	t.Run("try to get transform without name (connect-go)", func(t *testing.T) {
		assert := assertpkg.New(t)

		ctx, cancel := context.WithTimeout(ctx, 6*time.Second)
		t.Cleanup(cancel)

		msg, err := transformClient.GetTransform(ctx, connect.NewRequest(&v1alpha2.GetTransformRequest{}))
		assert.Nil(msg)
		assert.Error(err)
		assert.Equal(connect.CodeInvalidArgument.String(), connect.CodeOf(err).String())
	})
}

func (s *APISuite) TestListTransforms_v1alpha2() {
	t := s.T()

	require := requirepkg.New(t)
	assert := assertpkg.New(t)
	tfNameOne := "test-lt-tf"
	tfNameTwo := "test-lt-tf-2"
	inputTopicName := "wasm-tfm-lt-test-c"
	outputTopicName := "wasm-tfm-lt-test-d"
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()

	transformClient := v1alpha2connect.NewTransformServiceClient(http.DefaultClient, s.httpAddress())
	require.NoError(createKafkaTopic(ctx, s.kafkaAdminClient, inputTopicName, 2))
	require.NoError(createKafkaTopic(ctx, s.kafkaAdminClient, outputTopicName, 3))

	r1, err := createTransform(ctx, s.redpandaAdminClient, adminapi.TransformMetadata{
		Name:         tfNameOne,
		InputTopic:   inputTopicName,
		OutputTopics: []string{outputTopicName},
		Environment:  []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}},
	}, identityTransform)
	require.NoError(err)
	assert.Equal(tfNameOne, r1.Name)
	assert.Equal(inputTopicName, r1.InputTopic)
	assert.Equal([]string{outputTopicName}, r1.OutputTopics)

	r2, err := createTransform(ctx, s.redpandaAdminClient, adminapi.TransformMetadata{
		Name:         tfNameTwo,
		InputTopic:   inputTopicName,
		OutputTopics: []string{outputTopicName},
		Environment:  []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}},
	}, identityTransform)
	require.NoError(err)
	assert.Equal(tfNameTwo, r2.Name)
	assert.Equal(inputTopicName, r2.InputTopic)
	assert.Equal([]string{outputTopicName}, r2.OutputTopics)

	t.Cleanup(func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
		defer cancel()
		assert.NoError(deleteTransform(cleanupCtx, s.redpandaAdminClient, tfNameOne))
		assert.NoError(deleteTransform(cleanupCtx, s.redpandaAdminClient, tfNameTwo))
		assert.NoError(deleteKafkaTopic(cleanupCtx, s.kafkaAdminClient, inputTopicName))
		assert.NoError(deleteKafkaTopic(cleanupCtx, s.kafkaAdminClient, outputTopicName))
	})

	t.Run("list transforms with valid request (connect-go)", func(t *testing.T) {
		require := requirepkg.New(t)
		assert := assertpkg.New(t)

		transforms, err := transformClient.ListTransforms(ctx, connect.NewRequest(&v1alpha2.ListTransformsRequest{}))
		assert.NoError(err)

		assert.Len(transforms.Msg.Transforms, 2)
		for _, transform := range transforms.Msg.Transforms {
			assert.Condition(func() bool {
				return transform.Name == tfNameOne || transform.Name == tfNameTwo
			}, fmt.Sprintf("transform name should be %s or %s", tfNameOne, tfNameTwo))
			assert.Equal(inputTopicName, transform.InputTopicName)
			require.Len(transform.OutputTopicNames, 1)
			assert.Equal(outputTopicName, transform.OutputTopicNames[0])
		}
	})

	t.Run("list transforms with valid request (http)", func(t *testing.T) {
		require := requirepkg.New(t)
		assert := assertpkg.New(t)

		type transformStatus struct {
			BrokerID  int    `json:"broker_id"`
			Partition int    `json:"partition"`
			Statuses  string `json:"status"`
			Lag       int    `json:"lag"`
		}
		type transformMetadata struct {
			Name             string            `json:"name"`
			InputTopicName   string            `json:"input_topic_name"`
			OutputTopicNames []string          `json:"output_topic_names"`
			Statuses         []transformStatus `json:"statuses"`
		}
		type listTransformsResponse struct {
			Transforms []transformMetadata `json:"transforms"`
		}

		var httpRes listTransformsResponse
		var errResponse string
		err = requests.
			URL(s.httpAddress() + "/v1alpha2/transforms").
			ToJSON(&httpRes).
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.NoError(err)

		for _, transform := range httpRes.Transforms {
			assert.Condition(func() bool {
				return transform.Name == tfNameOne || transform.Name == tfNameTwo
			}, fmt.Sprintf("transform name should be %s or %s", tfNameOne, tfNameTwo))
			assert.Equal(inputTopicName, transform.InputTopicName)
			require.Len(transform.OutputTopicNames, 1)
			assert.Equal(outputTopicName, transform.OutputTopicNames[0])
		}
	})

	t.Run("list transforms with filter (connect-go)", func(t *testing.T) {
		require := requirepkg.New(t)
		assert := assertpkg.New(t)

		listTransformsRes, err := transformClient.ListTransforms(ctx, connect.NewRequest(&v1alpha2.ListTransformsRequest{
			Filter: &v1alpha2.ListTransformsRequest_Filter{NameContains: tfNameTwo},
		}))
		assert.NoError(err)

		require.Len(listTransformsRes.Msg.GetTransforms(), 1)

		transforms := listTransformsRes.Msg.GetTransforms()
		require.Len(transforms, 1)
		transform := transforms[0]
		assert.Equal(tfNameTwo, transform.Name)
		assert.Equal(inputTopicName, transform.InputTopicName)
		assert.Equal([]string{outputTopicName}, transform.OutputTopicNames)
	})
}

func (s *APISuite) TestDeleteTransforms_v1alpha2() {
	t := s.T()

	require := requirepkg.New(t)
	assert := assertpkg.New(t)

	ctx, cancel := context.WithTimeout(context.Background(), 24*time.Second)
	defer cancel()

	inputTopicName := "wasm-tfm-test-delete-input"
	outputTopicName := "wasm-tfm-test-delete-out"

	require.NoError(createKafkaTopic(ctx, s.kafkaAdminClient, inputTopicName, 2))
	require.NoError(createKafkaTopic(ctx, s.kafkaAdminClient, outputTopicName, 3))

	t.Cleanup(func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
		defer cancel()
		assert.NoError(deleteKafkaTopic(cleanupCtx, s.kafkaAdminClient, inputTopicName))
		assert.NoError(deleteKafkaTopic(cleanupCtx, s.kafkaAdminClient, outputTopicName))
	})

	transformClient := v1alpha2connect.NewTransformServiceClient(http.DefaultClient, s.httpAddress())

	t.Run("delete transform with valid request (connect-go)", func(t *testing.T) {
		require := requirepkg.New(t)
		assert := assertpkg.New(t)

		tfName := "delete-transform-valid-request-connect-go"
		_, err := createTransform(ctx, s.redpandaAdminClient, adminapi.TransformMetadata{
			Name:         tfName,
			InputTopic:   inputTopicName,
			OutputTopics: []string{outputTopicName},
			Environment:  []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}},
		}, identityTransform)
		require.NoError(err)
		t.Cleanup(func() {
			_ = deleteTransform(ctx, s.redpandaAdminClient, tfName)
		})

		_, err = transformClient.DeleteTransform(ctx, connect.NewRequest(&v1alpha2.DeleteTransformRequest{
			Name: tfName,
		}))
		assert.NoError(err)

		// Ensure the transform no longer exists
		_, err = transformClient.GetTransform(ctx, connect.NewRequest(&v1alpha2.GetTransformRequest{
			Name: tfName,
		}))
		assert.Error(err)
		assert.Equal(connect.CodeNotFound.String(), connect.CodeOf(err).String())
	})

	t.Run("delete transform with valid request (http)", func(t *testing.T) {
		require := requirepkg.New(t)
		assert := assertpkg.New(t)

		tfName := "delete-transform-valid-request-connect-go"
		_, err := createTransform(ctx, s.redpandaAdminClient, adminapi.TransformMetadata{
			Name:         tfName,
			InputTopic:   inputTopicName,
			OutputTopics: []string{outputTopicName},
			Environment:  []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}},
		}, identityTransform)
		require.NoError(err)
		t.Cleanup(func() {
			_ = deleteTransform(ctx, s.redpandaAdminClient, tfName)
		})

		var errResponse string
		err = requests.
			URL(s.httpAddress() + "/v1alpha2/transforms/" + tfName).
			Delete().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusNoContent), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.NoError(err)

		// Ensure the transform no longer exists
		_, err = transformClient.GetTransform(ctx, connect.NewRequest(&v1alpha2.GetTransformRequest{
			Name: tfName,
		}))
		assert.Error(err)
		assert.Equal(connect.CodeNotFound.String(), connect.CodeOf(err).String())
	})

	t.Run("try to delete non-existent transform (connect-go)", func(t *testing.T) {
		assert := assertpkg.New(t)

		_, err := transformClient.DeleteTransform(ctx, connect.NewRequest(&v1alpha2.DeleteTransformRequest{
			Name: "some-transform-name-that-does-not-exist",
		}))
		assert.Error(err)
		assert.Equal(connect.CodeNotFound.String(), connect.CodeOf(err).String())
	})
}
