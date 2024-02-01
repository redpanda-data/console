package integration

import (
	"context"
	"net/http"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/davecgh/go-spew/spew"
	asrt "github.com/stretchr/testify/assert"
	rqr "github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kadm"

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

func (s *APISuite) TestDeployTransform() {
	t := s.T()

	require := rqr.New(t)
	assert := asrt.New(t)

	t.Run("create transform with valid request (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), transformTimeout)
		defer cancel()

		topicClient := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		require.NoError(spawnTopic(ctx, 2, topicClient, "wasm-tfm-create-test-i"))
		require.NoError(spawnTopic(ctx, 2, topicClient, "wasm-tfm-create-test-o"))

		transformClient := v1alpha1connect.NewTransformServiceClient(http.DefaultClient, s.httpAddress())
		_, err := transformClient.DeployTransform(ctx, connect.NewRequest(&v1alpha1.DeployTransformRequest{
			Transform: &v1alpha1.DeployTransformRequest_Transform{
				Name:             "test-transform",
				WasmBinary:       technicallyATransform,
				InputTopicName:   "wasm-tfm-create-test-i",
				OutputTopicNames: []string{"wasm-tfm-create-test-o"},
				Environment:      nil,
			},
		}))
		assert.NoError(err)

		defer func() {
			_, err = transformClient.DeleteTransform(ctx, connect.NewRequest(&v1alpha1.DeleteTransformRequest{
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
	// require := rqr.New(t)
	assert := asrt.New(t)
	require := rqr.New(t)

	t.Run("create transform with valid request (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), transformTimeout)
		defer cancel()

		transformClient := v1alpha1connect.NewTransformServiceClient(http.DefaultClient, s.httpAddress())
		topicClient := v1alpha1connect.NewTopicServiceClient(http.DefaultClient, s.httpAddress())
		require.NoError(spawnTopic(ctx, 2, topicClient, "wasm-tfm-create-test-c"))
		require.NoError(spawnTopic(ctx, 2, topicClient, "wasm-tfm-create-test-d"))
		_, err := transformClient.DeployTransform(ctx, connect.NewRequest(&v1alpha1.DeployTransformRequest{
			Transform: &v1alpha1.DeployTransformRequest_Transform{
				Name:             "test-transform",
				WasmBinary:       technicallyATransform,
				InputTopicName:   "wasm-tfm-create-test-c",
				OutputTopicNames: []string{"wasm-tfm-create-test-d"},
				Environment:      map[string]string{"foo": "bar"},
			},
		}))
		require.NoError(err)

		msg, err := transformClient.GetTransform(ctx, connect.NewRequest(&v1alpha1.GetTransformRequest{
			Name: "test-transform",
		}))
		assert.NoError(err)

		assert.Equal(msg.Msg.Transform.Name, "test-transform")
		assert.Equal(msg.Msg.Transform.InputTopicName, "wasm-tfm-create-test-c")
		assert.Equal(msg.Msg.Transform.OutputTopicNames, []string{"wasm-tfm-create-test-d"})
		defer func() {
			_, err = transformClient.DeleteTransform(ctx, connect.NewRequest(&v1alpha1.DeleteTransformRequest{
				Name: "test-transform",
			}))
			require.NoError(err)
			require.NoError(despawnTopic(ctx, topicClient, "wasm-tfm-create-test-c"))
			require.NoError(despawnTopic(ctx, topicClient, "wasm-tfm-create-test-d"))
		}()
		_, err = transformClient.GetTransform(ctx, connect.NewRequest(&v1alpha1.GetTransformRequest{
			Name: "test-transform",
		}))
		assert.NoError(err, "transform should exist")
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
		_, err := transformClient.DeployTransform(ctx, connect.NewRequest(&v1alpha1.DeployTransformRequest{
			Transform: &v1alpha1.DeployTransformRequest_Transform{
				Name:             "test-transform1",
				WasmBinary:       technicallyATransform,
				InputTopicName:   "wasm-tfm-list-test-a",
				OutputTopicNames: []string{"wasm-tfm-list-test-b"},
				Environment:      nil,
			},
		}))
		require.NoError(err)
		_, err = transformClient.DeployTransform(ctx, connect.NewRequest(&v1alpha1.DeployTransformRequest{
			Transform: &v1alpha1.DeployTransformRequest_Transform{
				Name:             "test-transform2",
				WasmBinary:       technicallyATransform,
				InputTopicName:   "wasm-tfm-list-test-a",
				OutputTopicNames: []string{"wasm-tfm-list-test-b"},
				Environment:      nil,
			},
		}))
		spew.Dump(err)
		require.NoError(err)

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
		_, err := transformClient.DeployTransform(ctx, connect.NewRequest(&v1alpha1.DeployTransformRequest{
			Transform: &v1alpha1.DeployTransformRequest_Transform{
				Name:             "del-test-transform",
				WasmBinary:       technicallyATransform,
				InputTopicName:   "wasm-tfm-delete-test-e",
				OutputTopicNames: []string{"wasm-tfm-delete-test-f"},
				Environment:      nil,
			},
		}))
		require.NoError(err)

		_, err = transformClient.DeleteTransform(ctx, connect.NewRequest(&v1alpha1.DeleteTransformRequest{
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
