// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package serde

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/redpanda-data/console/backend/pkg/config"
	ms "github.com/redpanda-data/console/backend/pkg/msgpack"
)

func TestMsgPackSerde_DeserializePayload(t *testing.T) {
	// setup data
	type Item struct {
		Foo string
	}

	in := Item{Foo: "bar"}
	msgData, err := msgpack.Marshal(&in)
	require.NoError(t, err)

	mspPackSvc, err := ms.NewService(config.Msgpack{
		Enabled:    true,
		TopicNames: []string{"msgpack_topic"},
	})
	require.NoError(t, err)

	// serde
	serde := MsgPackSerde{
		MsgPackService: mspPackSvc,
	}

	tests := []struct {
		name           string
		record         func() *kgo.Record
		payloadType    PayloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "msgpack in value",
			record: func() *kgo.Record {
				return &kgo.Record{
					Value: msgData,
					Topic: "msgpack_topic",
				}
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingMsgPack, payload.Encoding)

				jd, err := json.Marshal(in)
				require.NoError(t, err)

				assert.Equal(t, string(jd), string(payload.NormalizedPayload))

				obj, ok := (payload.DeserializedPayload).(map[string]any)
				require.Truef(t, ok, "parsed payload is not of type map[string]any")
				assert.Equal(t, "bar", obj["Foo"])
			},
		},
		{
			name: "not in topic map",
			record: func() *kgo.Record {
				return &kgo.Record{
					Value: msgData,
					Topic: "not_msgpack_topic",
				}
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, _ RecordPayload, err error) {
				require.Error(t, err)
				assert.Equal(t, "message pack encoding not configured for topic: not_msgpack_topic", err.Error())
			},
		},
		{
			name: "msgpack 2",
			record: func() *kgo.Record {
				msgPackBinFile := "testdata/msgpack/example.msgpack.bin"

				msgPackData, err := os.ReadFile(msgPackBinFile)
				require.NoError(t, err)

				return &kgo.Record{
					Value: msgPackData,
					Topic: "msgpack_topic",
				}
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)

				assert.Equal(t,
					`{"array":[3,2,"1",0],"binary":"AAAAAAo=","negative":false,"num":-2.4,"positive":true}`,
					string(payload.NormalizedPayload))

				obj, ok := (payload.DeserializedPayload).(map[string]any)
				require.Truef(t, ok, "parsed payload is not of type map[string]any")
				assert.Equal(t, -2.4, obj["num"])
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload, err := serde.DeserializePayload(t.Context(), test.record(), test.payloadType)
			test.validationFunc(t, *payload, err)
		})
	}
}

func TestMsgPackSerde_SerializeObject(t *testing.T) {
	type Item struct {
		Foo string
	}

	mspPackSvc, err := ms.NewService(config.Msgpack{
		Enabled:    true,
		TopicNames: []string{"msgpack_topic"},
	})
	require.NoError(t, err)

	// serde
	serde := MsgPackSerde{
		MsgPackService: mspPackSvc,
	}

	t.Run("string json", func(t *testing.T) {
		item := Item{Foo: "bar"}
		expected, err := msgpack.Marshal(item)
		require.NoError(t, err)

		actual, err := serde.SerializeObject(t.Context(), `{"Foo":"bar"}`, PayloadTypeValue)
		assert.NoError(t, err)

		assert.Equal(t, expected, actual)
	})

	t.Run("string json array", func(t *testing.T) {
		expected, err := msgpack.Marshal([]string{"foo", "bar"})
		require.NoError(t, err)

		actual, err := serde.SerializeObject(t.Context(), `["foo","bar"]`, PayloadTypeValue)
		assert.NoError(t, err)

		assert.Equal(t, expected, actual)
	})

	t.Run("string invalid json", func(t *testing.T) {
		actual, err := serde.SerializeObject(t.Context(), `foo`, PayloadTypeValue)
		require.Error(t, err)
		assert.Equal(t, "first byte indicates this it not valid JSON, expected brackets", err.Error())
		require.Nil(t, actual)
	})

	t.Run("string json map type", func(t *testing.T) {
		item := map[string]any{
			"Foo": "bar",
		}
		expected, err := msgpack.Marshal(item)
		require.NoError(t, err)

		actual, err := serde.SerializeObject(t.Context(), `{"Foo":"bar"}`, PayloadTypeValue)
		assert.NoError(t, err)

		assert.Equal(t, expected, actual)
	})

	t.Run("map type", func(t *testing.T) {
		item := map[string]any{
			"Foo": "bar",
		}
		expected, err := msgpack.Marshal(item)
		require.NoError(t, err)

		actual, err := serde.SerializeObject(t.Context(), item, PayloadTypeValue)
		assert.NoError(t, err)

		assert.Equal(t, expected, actual)
	})

	t.Run("struct type", func(t *testing.T) {
		item := Item{Foo: "bar"}
		expected, err := msgpack.Marshal(item)
		require.NoError(t, err)

		actual, err := serde.SerializeObject(t.Context(), item, PayloadTypeValue)
		assert.NoError(t, err)

		assert.Equal(t, expected, actual)
	})

	t.Run("byte json", func(t *testing.T) {
		item := Item{Foo: "bar"}
		expected, err := msgpack.Marshal(item)
		require.NoError(t, err)

		actual, err := serde.SerializeObject(t.Context(), []byte(`{"Foo":"bar"}`), PayloadTypeValue)
		assert.NoError(t, err)

		assert.Equal(t, expected, actual)
	})

	t.Run("byte json array", func(t *testing.T) {
		expected, err := msgpack.Marshal([]string{"foo", "bar"})
		require.NoError(t, err)

		actual, err := serde.SerializeObject(t.Context(), []byte(`["foo","bar"]`), PayloadTypeValue)
		assert.NoError(t, err)

		assert.Equal(t, expected, actual)
	})

	t.Run("byte json map type", func(t *testing.T) {
		item := map[string]any{
			"Foo": "bar",
		}
		expected, err := msgpack.Marshal(item)
		require.NoError(t, err)

		actual, err := serde.SerializeObject(t.Context(), []byte(`{"Foo":"bar"}`), PayloadTypeValue)
		assert.NoError(t, err)

		assert.Equal(t, expected, actual)
	})

	t.Run("byte", func(t *testing.T) {
		item := Item{Foo: "bar"}
		expected, err := msgpack.Marshal(item)
		require.NoError(t, err)

		input, err := msgpack.Marshal(item)
		require.NoError(t, err)

		actual, err := serde.SerializeObject(t.Context(), input, PayloadTypeValue)
		assert.NoError(t, err)

		assert.Equal(t, expected, actual)
	})
}
