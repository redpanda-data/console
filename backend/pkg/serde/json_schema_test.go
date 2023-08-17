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
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
)

func TestJsonSchemaSerde_DeserializePayload(t *testing.T) {
	serde := JsonSchemaSerde{}

	type Item struct {
		Foo string `json:"foo"`
	}

	in := Item{Foo: "bar"}

	var srSerde sr.Serde
	srSerde.Register(
		1000,
		&Item{},
		sr.EncodeFn(func(v any) ([]byte, error) {
			return json.Marshal(v.(*Item))
		}),
		sr.DecodeFn(func(b []byte, v any) error {
			return json.Unmarshal(b, v.(*Item))
		}),
	)

	msgData, err := srSerde.Encode(&in)
	require.NoError(t, err)

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    PayloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "Valid JSON Object in value",
			record: &kgo.Record{
				Value: msgData,
			},
			payloadType: payloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingJSON, payload.Encoding)

				obj, ok := (payload.ParsedPayload).(map[string]any)
				require.Truef(t, ok, "parsed payload is not of type map[string]any")
				assert.Equal(t, "bar", obj["foo"])
			},
		},
		{
			name: "Valid JSON Object in key",
			record: &kgo.Record{
				Key: msgData,
			},
			payloadType: payloadTypeKey,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingJSON, payload.Encoding)
			},
		},
		{
			name: "valid json not wrapped",
			record: &kgo.Record{
				Value: []byte(`[10, 20, 30, 40, 50, 60, 70, 80, 90]`),
			},
			payloadType: payloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				assert.Error(t, err)
				assert.Equal(t, "incorrect magic byte for json schema", err.Error())
			},
		},
		{
			name: "Invalid JSON",
			record: &kgo.Record{
				Value: []byte(`this is no valid JSON`),
			},
			payloadType: payloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				assert.Error(t, err)
				assert.Equal(t, "incorrect magic byte for json schema", err.Error())
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload, err := serde.DeserializePayload(test.record, test.payloadType)
			test.validationFunc(t, payload, err)
		})
	}
}
