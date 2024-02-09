package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/redpanda-data/redpanda/src/go/rpk/pkg/adminapi"
	asrt "github.com/stretchr/testify/assert"
	rqr "github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kadm"

	"github.com/redpanda-data/console/backend/pkg/api/connect/service/transform"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	v1alpha1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
)

var (
	technicallyATransform = []byte{0x00, 0x61, 0x73, 0x6D}
	transformTimeout      = 30 * time.Second
)

type response struct {
	Transform *adminapi.TransformMetadata `json:"transform"`
}

func findExactTransformByName(ts []adminapi.TransformMetadata, name string) (*adminapi.TransformMetadata, error) {
	for _, t := range ts {
		if t.Name == name {
			return &t, nil
		}
	}
	return nil, fmt.Errorf("transform not found")
}

func spawnTopic(ctx context.Context, k *kadm.Client, topic string, partitionCount int) error {
	_, err := k.CreateTopic(ctx, int32(partitionCount), int16(1), map[string]*string{}, topic)
	return err
}

func despawnTopic(ctx context.Context, k *kadm.Client, topic string) error {
	_, err := k.DeleteTopics(ctx, topic)
	return err
}

func spawnTransform(ctx context.Context, svc *adminapi.AdminAPI, meta adminapi.TransformMetadata, b []byte) (*adminapi.TransformMetadata, error) {
	if err := svc.DeployWasmTransform(ctx, meta, bytes.NewReader(b)); err != nil {
		return nil, err
	}
	transforms, err := svc.ListWasmTransforms(ctx)
	if err != nil {
		return nil, err
	}
	return findExactTransformByName(transforms, meta.Name)
}

func despawnTransform(ctx context.Context, svc *adminapi.AdminAPI, name string) error {
	return svc.DeleteWasmTransform(ctx, name)
}

// DirectDeployAndTestTransform encapsulates the logic for creating a transform and asserting its successful creation.
func (s *APISuite) TestDeployTransform() {
	t := s.T()
	require := rqr.New(t)
	assert := asrt.New(t)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second) // Adjust timeout as necessary
	defer cancel()
	tfName := "test-transform"
	inputTopicName := "wasm-tfm-create-test-i"
	outputTopicName := "wasm-tfm-create-test-o"

	// Create input and output topics
	require.NoError(spawnTopic(ctx, s.kafkaAdminClient, inputTopicName, 2))
	require.NoError(spawnTopic(ctx, s.kafkaAdminClient, outputTopicName, 3))

	defer func() {
		// Clean up: delete transform and topics
		require.NoError(despawnTransform(ctx, s.redpandaAdminClient, tfName))
		require.NoError(despawnTopic(ctx, s.kafkaAdminClient, inputTopicName))
		require.NoError(despawnTopic(ctx, s.kafkaAdminClient, outputTopicName))
	}()

	// Prepare the multipart request with transform metadata and wasm binary
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	metadataOut := transform.Metadata{
		Name:         tfName,
		InputTopic:   inputTopicName,
		OutputTopics: []string{outputTopicName},
		Environment:  []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}},
	}

	metadataPart, err := writer.CreateFormField("metadata")
	require.NoError(err)
	require.NoError(json.NewEncoder(metadataPart).Encode(metadataOut))

	wasmPart, err := writer.CreateFormFile("wasm_binary", "transform.wasm")
	require.NoError(err)

	_, err = wasmPart.Write(technicallyATransform)
	require.NoError(err)

	require.NoError(writer.Close())

	req, err := http.NewRequestWithContext(ctx, "PUT", fmt.Sprintf("http://%s:%d/v1alpha1/transforms", s.api.Cfg.REST.HTTPListenAddress, s.api.Cfg.REST.HTTPListenPort), body)
	require.NoError(err)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	require.NoError(err)
	defer resp.Body.Close()

	require.Equal(http.StatusCreated, resp.StatusCode, "Expected HTTP status code 201 for successful transform creation")

	var metaResp response
	require.NoError(json.NewDecoder(resp.Body).Decode(&metaResp))

	// Assertions to verify the transform has been created correctly
	assert.Equal(tfName, metaResp.Transform.Name)
	assert.Equal(inputTopicName, metaResp.Transform.InputTopic)
	assert.Equal([]string{outputTopicName}, metaResp.Transform.OutputTopics)
}

func (s *APISuite) TestGetTransform() {
	t := s.T()
	assert := asrt.New(t)
	require := rqr.New(t)
	ctx, cancel := context.WithTimeout(context.Background(), transformTimeout)
	defer cancel()
	tfName := "test-get-tf"
	inputTopicName := "wasm-tfm-create-test-c"
	outputTopicName := "wasm-tfm-create-test-d"

	t.Run("create transform with valid request", func(t *testing.T) {
		transformClient := v1alpha1connect.NewTransformServiceClient(http.DefaultClient, s.httpAddress())
		require.NoError(spawnTopic(ctx, s.kafkaAdminClient, inputTopicName, 2))
		require.NoError(spawnTopic(ctx, s.kafkaAdminClient, outputTopicName, 3))

		r, err := spawnTransform(ctx, s.redpandaAdminClient, adminapi.TransformMetadata{
			Name:         tfName,
			InputTopic:   inputTopicName,
			OutputTopics: []string{outputTopicName},
			Environment:  []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}},
		}, technicallyATransform)
		require.NoError(err)
		assert.Equal(tfName, r.Name)
		assert.Equal(inputTopicName, r.InputTopic)
		assert.Equal([]string{outputTopicName}, r.OutputTopics)

		defer func() {
			require.NoError(despawnTransform(ctx, s.redpandaAdminClient, tfName))
			require.NoError(despawnTopic(ctx, s.kafkaAdminClient, inputTopicName))
			require.NoError(despawnTopic(ctx, s.kafkaAdminClient, outputTopicName))
		}()
		msg, err := transformClient.GetTransform(ctx, connect.NewRequest(&v1alpha1.GetTransformRequest{
			Name: tfName,
		}))
		assert.NoError(err)

		assert.Equal(tfName, msg.Msg.Transform.Name)
		assert.Equal(inputTopicName, msg.Msg.Transform.InputTopicName)
		assert.Equal([]string{outputTopicName}, msg.Msg.Transform.OutputTopicNames)
	})
}

func (s *APISuite) TestListTransforms() {
	t := s.T()

	require := rqr.New(t)
	assert := asrt.New(t)
	tfNameOne := "test-lt-tf"
	tfNameTwo := "test-lt-tf-2"
	inputTopicName := "wasm-tfm-lt-test-c"
	outputTopicName := "wasm-tfm-lt-test-d"
	ctx, cancel := context.WithTimeout(context.Background(), transformTimeout)
	defer cancel()

	t.Run("list transforms with valid request", func(t *testing.T) {
		transformClient := v1alpha1connect.NewTransformServiceClient(http.DefaultClient, s.httpAddress())
		require.NoError(spawnTopic(ctx, s.kafkaAdminClient, inputTopicName, 2))
		require.NoError(spawnTopic(ctx, s.kafkaAdminClient, outputTopicName, 3))

		r1, err := spawnTransform(ctx, s.redpandaAdminClient, adminapi.TransformMetadata{
			Name:         tfNameOne,
			InputTopic:   inputTopicName,
			OutputTopics: []string{outputTopicName},
			Environment:  []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}},
		}, technicallyATransform)
		require.NoError(err)
		assert.Equal(tfNameOne, r1.Name)
		assert.Equal(inputTopicName, r1.InputTopic)
		assert.Equal([]string{outputTopicName}, r1.OutputTopics)

		r2, err := spawnTransform(ctx, s.redpandaAdminClient, adminapi.TransformMetadata{
			Name:         tfNameTwo,
			InputTopic:   inputTopicName,
			OutputTopics: []string{outputTopicName},
			Environment:  []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}},
		}, technicallyATransform)
		require.NoError(err)
		assert.Equal(tfNameTwo, r2.Name)
		assert.Equal(inputTopicName, r2.InputTopic)
		assert.Equal([]string{outputTopicName}, r2.OutputTopics)

		defer func() {
			require.NoError(despawnTransform(ctx, s.redpandaAdminClient, tfNameOne))
			require.NoError(despawnTransform(ctx, s.redpandaAdminClient, tfNameTwo))
			require.NoError(despawnTopic(ctx, s.kafkaAdminClient, inputTopicName))
			require.NoError(despawnTopic(ctx, s.kafkaAdminClient, outputTopicName))
		}()

		transforms, err := transformClient.ListTransforms(ctx, connect.NewRequest(&v1alpha1.ListTransformsRequest{
			Filter: &v1alpha1.ListTransformsRequest_Filter{
				Name: tfNameOne,
			},
		}))
		assert.NoError(err)

		for _, transform := range transforms.Msg.Transforms {
			assert.Condition(func() bool {
				return transform.Name == tfNameOne || transform.Name == tfNameTwo
			}, fmt.Sprintf("transform name should be %s or %s", tfNameOne, tfNameTwo))
			assert.Equal(inputTopicName, transform.InputTopicName)
			assert.Condition(func() bool {
				for _, topic := range transform.OutputTopicNames {
					if topic == outputTopicName {
						return true
					}
				}
				return false
			}, fmt.Sprintf("transform output topic should be %s", outputTopicName))
		}
		_, err = transformClient.ListTransforms(ctx, connect.NewRequest(&v1alpha1.ListTransformsRequest{}))
		assert.NoError(err)
	})
}

func (s *APISuite) TestNilFilterListTransform() {
	t := s.T()

	require := rqr.New(t)
	assert := asrt.New(t)
	tfNameOne := "test-nf-tf"
	tfNameTwo := "test-nf-tf-2"
	inputTopicName := "wasm-tfm-nf-test-c"
	outputTopicName := "wasm-tfm-nf-test-d"
	ctx, cancel := context.WithTimeout(context.Background(), transformTimeout)
	defer cancel()

	t.Run("list transforms with valid request", func(t *testing.T) {
		transformClient := v1alpha1connect.NewTransformServiceClient(http.DefaultClient, s.httpAddress())
		require.NoError(spawnTopic(ctx, s.kafkaAdminClient, inputTopicName, 2))
		require.NoError(spawnTopic(ctx, s.kafkaAdminClient, outputTopicName, 3))

		r1, err := spawnTransform(ctx, s.redpandaAdminClient, adminapi.TransformMetadata{
			Name:         tfNameOne,
			InputTopic:   inputTopicName,
			OutputTopics: []string{outputTopicName},
			Environment:  []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}},
		}, technicallyATransform)
		require.NoError(err)
		assert.Equal(tfNameOne, r1.Name)
		assert.Equal(inputTopicName, r1.InputTopic)
		assert.Equal([]string{outputTopicName}, r1.OutputTopics)

		r2, err := spawnTransform(ctx, s.redpandaAdminClient, adminapi.TransformMetadata{
			Name:         tfNameTwo,
			InputTopic:   inputTopicName,
			OutputTopics: []string{outputTopicName},
			Environment:  []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}},
		}, technicallyATransform)
		require.NoError(err)
		assert.Equal(tfNameTwo, r2.Name)
		assert.Equal(inputTopicName, r2.InputTopic)
		assert.Equal([]string{outputTopicName}, r2.OutputTopics)

		defer func() {
			require.NoError(despawnTransform(ctx, s.redpandaAdminClient, tfNameOne))
			require.NoError(despawnTransform(ctx, s.redpandaAdminClient, tfNameTwo))
			require.NoError(despawnTopic(ctx, s.kafkaAdminClient, inputTopicName))
			require.NoError(despawnTopic(ctx, s.kafkaAdminClient, outputTopicName))
		}()

		transforms, err := transformClient.ListTransforms(ctx, connect.NewRequest(&v1alpha1.ListTransformsRequest{}))
		assert.NoError(err)

		for _, transform := range transforms.Msg.Transforms {
			assert.Condition(func() bool {
				return transform.Name == tfNameOne || transform.Name == tfNameTwo
			}, fmt.Sprintf("transform name should be %s or %s", tfNameOne, tfNameTwo))
			assert.Equal(inputTopicName, transform.InputTopicName)
			assert.Condition(func() bool {
				for _, topic := range transform.OutputTopicNames {
					if topic == outputTopicName {
						return true
					}
				}
				return false
			}, fmt.Sprintf("transform output topic should be %s", outputTopicName))
		}
		_, err = transformClient.ListTransforms(ctx, connect.NewRequest(&v1alpha1.ListTransformsRequest{}))
		assert.NoError(err)
	})
}

func (s *APISuite) TestDeleteTransforms() {
	t := s.T()

	require := rqr.New(t)
	assert := asrt.New(t)
	tfName := "del-test-transform"
	inputTopicName := "wasm-tfm-delete-test-e"
	outputTopicName := "wasm-tfm-delete-test-f"
	ctx, cancel := context.WithTimeout(context.Background(), transformTimeout)
	defer cancel()
	t.Run("delete transform with valid request", func(t *testing.T) {
		transformClient := v1alpha1connect.NewTransformServiceClient(http.DefaultClient, s.httpAddress())
		defer func() {
			require.NoError(despawnTransform(ctx, s.redpandaAdminClient, tfName))
			require.NoError(despawnTopic(ctx, s.kafkaAdminClient, inputTopicName))
			require.NoError(despawnTopic(ctx, s.kafkaAdminClient, outputTopicName))
		}()
		require.NoError(spawnTopic(ctx, s.kafkaAdminClient, inputTopicName, 2))
		require.NoError(spawnTopic(ctx, s.kafkaAdminClient, outputTopicName, 3))
		resp, err := spawnTransform(ctx, s.redpandaAdminClient, adminapi.TransformMetadata{
			Name:         tfName,
			InputTopic:   inputTopicName,
			OutputTopics: []string{outputTopicName},
			Environment:  []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}},
		}, technicallyATransform)
		require.NoError(err)
		assert.Equal(tfName, resp.Name)
		assert.Equal(inputTopicName, resp.InputTopic)
		assert.Equal([]string{outputTopicName}, resp.OutputTopics)

		_, err = transformClient.DeleteTransform(ctx, connect.NewRequest(&v1alpha1.DeleteTransformRequest{
			Name: tfName,
		}))
		assert.NoError(err)
		_, err = transformClient.GetTransform(ctx, connect.NewRequest(&v1alpha1.GetTransformRequest{
			Name: tfName,
		}))
		assert.Error(err)
	})
}
