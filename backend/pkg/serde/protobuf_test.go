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
	"testing"

	"github.com/twmb/franz-go/pkg/kgo"
)

func TestProtobufSerde_DeserializePayload(t *testing.T) {
	// serde
	serde := ProtobufSerde{}

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    payloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		// {
		// 	name: "avro in value",
		// 	record: &kgo.Record{
		// 		Value: msgData,
		// 	},
		// 	payloadType: payloadTypeValue,
		// 	validationFunc: func(t *testing.T, payload RecordPayload, err error) {
		// 		require.NoError(t, err)
		// 		assert.Nil(t, payload.Troubleshooting)
		// 		assert.Nil(t, payload.SchemaID)
		// 		assert.Equal(t, payloadEncodingAvro, payload.Encoding)

		// 		obj, ok := (payload.ParsedPayload).([]byte)
		// 		require.Truef(t, ok, "parsed payload is not of type string")

		// 		assert.Equal(t, `{"a":27,"b":"foo"}`, string(obj))
		// 	},
		// },
		// {
		// 	name: "payload too small",
		// 	record: &kgo.Record{
		// 		Value: []byte{0, 1, 2, 3},
		// 	},
		// 	payloadType: payloadTypeValue,
		// 	validationFunc: func(t *testing.T, payload RecordPayload, err error) {
		// 		assert.Error(t, err)
		// 		assert.Equal(t, "payload size is < 5", err.Error())
		// 	},
		// },
		// {
		// 	name: "missing magic byte",
		// 	record: &kgo.Record{
		// 		Value: []byte{1, 2, 3, 4, 5, 6, 7},
		// 	},
		// 	payloadType: payloadTypeValue,
		// 	validationFunc: func(t *testing.T, payload RecordPayload, err error) {
		// 		assert.Error(t, err)
		// 		assert.Equal(t, "incorrect magic byte", err.Error())
		// 	},
		// },
		// {
		// 	name: "missing schema",
		// 	record: &kgo.Record{
		// 		Value: msgData2,
		// 	},
		// 	payloadType: payloadTypeValue,
		// 	validationFunc: func(t *testing.T, payload RecordPayload, err error) {
		// 		assert.Error(t, err)
		// 		assert.Contains(t, err.Error(), "getting avro schema from registry: failed to get schema from registry: get schema by id request failed")
		// 	},
		// },
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload, err := serde.DeserializePayload(test.record, test.payloadType)
			test.validationFunc(t, payload, err)
		})
	}
}
