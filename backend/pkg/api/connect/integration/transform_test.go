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

	"github.com/redpanda-data/console/backend/pkg/api"
	"github.com/redpanda-data/console/backend/pkg/config"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	v1alpha1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
)

var (
	technicallyATransform = []byte{0x00, 0x61, 0x73, 0x6D}
	transformTimeout      = 30 * time.Second
)

func despawnTopic(ctx context.Context, client v1alpha1connect.TopicServiceClient, topic string) error {
	_, err := client.DeleteTopic(ctx, connect.NewRequest(&v1alpha1.DeleteTopicRequest{
		Name: topic,
	}))
	return err
}

func spawnTopic(ctx context.Context, partitionCount int32, client v1alpha1connect.TopicServiceClient, topic string) error {
	_, err := client.CreateTopic(ctx, connect.NewRequest(&v1alpha1.CreateTopicRequest{
		Topic: &v1alpha1.CreateTopicRequest_Topic{
			Name:           topic,
			PartitionCount: &partitionCount,
			Configs: []*v1alpha1.CreateTopicRequest_Topic_Config{
				{
					Name:  "cleanup.policy",
					Value: kadm.StringPtr("compact"),
				},
			},
		},
	}))
	return err
}

func spawnTransform(cfg config.Server, name, inputTopic string, outputTopics []string, env []adminapi.EnvironmentVariable, wasm []byte) error {
	metadata := api.TransformMetadata{
		Name:         name,
		InputTopic:   inputTopic,
		OutputTopics: outputTopics,
		Environment:  env,
	}
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	metadataPart, err := writer.CreateFormField("metadata")
	if err != nil {
		return err
	}

	if err := json.NewEncoder(metadataPart).Encode(metadata); err != nil {
		return err
	}

	wasmPart, err := writer.CreateFormFile("wasm_binary", "transform.wasm")
	if err != nil {
		return err
	}

	if _, err := wasmPart.Write(wasm); err != nil {
		return err
	}

	if err := writer.Close(); err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(context.Background(), "PUT", fmt.Sprintf("http://%s:%d/v1alpha1/transforms", cfg.HTTPListenAddress, cfg.HTTPListenPort), body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}

	if resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("unexpected status code: %d message: %s", resp.StatusCode, resp.Status)
	}
	return nil
}

func (s *APISuite) TestDeployTransform() {
	t := s.T()

	require := rqr.New(t)
	assert := asrt.New(t)

	t.Run("create transform with valid request (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), transformTimeout)
		defer cancel()

		topicClient := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		require.NoError(spawnTopic(ctx, 2, topicClient, "wasm-tfm-create-test-i"))
		require.NoError(spawnTopic(ctx, 3, topicClient, "wasm-tfm-create-test-o"))

		transformClient := v1alpha1connect.NewTransformServiceClient(http.DefaultClient, s.httpAddress())
		stErr := spawnTransform(s.api.Cfg.REST, "test-transform",
			"wasm-tfm-create-test-i",
			[]string{"wasm-tfm-create-test-o"},
			[]adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}},
			technicallyATransform)

		assert.NoError(stErr, fmt.Sprintf("error: %v", stErr))

		defer func() {
			_, err := transformClient.DeleteTransform(ctx, connect.NewRequest(&v1alpha1.DeleteTransformRequest{
				Name: "test-transform",
			}))
			require.NoError(err)
			require.NoError(despawnTopic(ctx, topicClient, "wasm-tfm-create-test-i"))
			require.NoError(despawnTopic(ctx, topicClient, "wasm-tfm-create-test-o"))
		}()
	})
}

func (s *APISuite) TestGetTransform() {
	t := s.T()
	assert := asrt.New(t)
	require := rqr.New(t)

	t.Run("create transform with valid request (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), transformTimeout)
		defer cancel()

		transformClient := v1alpha1connect.NewTransformServiceClient(http.DefaultClient, s.httpAddress())
		topicClient := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		require.NoError(spawnTopic(ctx, 3, topicClient, "wasm-tfm-create-test-c"))
		require.NoError(spawnTopic(ctx, 2, topicClient, "wasm-tfm-create-test-d"))

		require.NoError(spawnTransform(s.api.Cfg.REST, "test-transform-get", "wasm-tfm-create-test-c", []string{"wasm-tfm-create-test-d"}, []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}}, technicallyATransform))

		msg, err := transformClient.GetTransform(ctx, connect.NewRequest(&v1alpha1.GetTransformRequest{
			Name: "test-transform-get",
		}))
		assert.NoError(err)

		assert.Equal(msg.Msg.Transform.Name, "test-transform-get")
		assert.Equal(msg.Msg.Transform.InputTopicName, "wasm-tfm-create-test-c")
		assert.Equal(msg.Msg.Transform.OutputTopicNames, []string{"wasm-tfm-create-test-d"})
		defer func() {
			_, err = transformClient.DeleteTransform(ctx, connect.NewRequest(&v1alpha1.DeleteTransformRequest{
				Name: "test-transform-get",
			}))
			require.NoError(err)
			require.NoError(despawnTopic(ctx, topicClient, "wasm-tfm-create-test-c"))
			require.NoError(despawnTopic(ctx, topicClient, "wasm-tfm-create-test-d"))
		}()
	})
}

func (s *APISuite) TestListTransforms() {
	t := s.T()

	require := rqr.New(t)
	assert := asrt.New(t)

	t.Run("list transforms with valid request (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), transformTimeout)
		defer cancel()

		transformClient := v1alpha1connect.NewTransformServiceClient(http.DefaultClient, s.httpAddress())
		topicClient := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		require.NoError(spawnTopic(ctx, 2, topicClient, "wasm-tfm-list-test-a"))
		require.NoError(spawnTopic(ctx, 2, topicClient, "wasm-tfm-list-test-b"))

		require.NoError(spawnTransform(s.api.Cfg.REST, "test-transform1", "wasm-tfm-list-test-a", []string{"wasm-tfm-list-test-b"}, []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}}, technicallyATransform))
		require.NoError(spawnTransform(s.api.Cfg.REST, "test-transform2", "wasm-tfm-list-test-a", []string{"wasm-tfm-list-test-b"}, []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}}, technicallyATransform))

		transforms, err := transformClient.ListTransforms(ctx, connect.NewRequest(&v1alpha1.ListTransformsRequest{
			Filter: &v1alpha1.ListTransformsRequest_Filter{
				Name: "test-transform1",
			},
		}))
		assert.NoError(err)

		for _, transform := range transforms.Msg.Transforms {
			assert.Condition(func() bool {
				return transform.Name == "test-transform1" || transform.Name == "test-transform2"
			}, "transform name should be test-transform1 or test-transform2")
			assert.Equal(transform.InputTopicName, "wasm-tfm-list-test-a")
			assert.Condition(func() bool {
				for _, topic := range transform.OutputTopicNames {
					if topic == "wasm-tfm-list-test-b" {
						return true
					}
				}
				return false
			}, "transform output topic should be wasm-tfm-list-test-b")
		}

		defer func() {
			_, err = transformClient.DeleteTransform(ctx, connect.NewRequest(&v1alpha1.DeleteTransformRequest{
				Name: "test-transform1",
			}))
			require.NoError(err)
			_, err = transformClient.DeleteTransform(ctx, connect.NewRequest(&v1alpha1.DeleteTransformRequest{
				Name: "test-transform2",
			}))
			require.NoError(err)
			require.NoError(despawnTopic(ctx, topicClient, "wasm-tfm-list-test-a"))
			require.NoError(despawnTopic(ctx, topicClient, "wasm-tfm-list-test-b"))
		}()

		_, err = transformClient.ListTransforms(ctx, connect.NewRequest(&v1alpha1.ListTransformsRequest{}))
		assert.NoError(err)
	})
}

func (s *APISuite) TestDeleteTransforms() {
	t := s.T()

	require := rqr.New(t)
	assert := asrt.New(t)

	t.Run("delete transform with valid request (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), transformTimeout)
		defer cancel()

		transformClient := v1alpha1connect.NewTransformServiceClient(http.DefaultClient, s.httpAddress())
		topicClient := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		require.NoError(spawnTopic(ctx, 2, topicClient, "wasm-tfm-delete-test-e"))
		require.NoError(spawnTopic(ctx, 2, topicClient, "wasm-tfm-delete-test-f"))
		require.NoError(spawnTransform(s.api.Cfg.REST, "del-test-transform", "wasm-tfm-delete-test-e", []string{"wasm-tfm-delete-test-f"}, []adminapi.EnvironmentVariable{{Key: "foo", Value: "bar"}}, technicallyATransform))
		_, err := transformClient.DeleteTransform(ctx, connect.NewRequest(&v1alpha1.DeleteTransformRequest{
			Name: "del-test-transform",
		}))
		assert.NoError(err)

		_, err = transformClient.GetTransform(ctx, connect.NewRequest(&v1alpha1.GetTransformRequest{
			Name: "del-test-transform",
		}))
		assert.Error(err)

		defer func() {
			require.NoError(despawnTopic(ctx, topicClient, "wasm-tfm-delete-test-e"))
			require.NoError(despawnTopic(ctx, topicClient, "wasm-tfm-delete-test-f"))
		}()
	})
}
