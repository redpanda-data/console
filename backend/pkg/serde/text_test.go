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

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
)

func TestTextSerde_DeserializePayload(t *testing.T) {
	serde := TextSerde{}

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    PayloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "trimmed",
			record: &kgo.Record{
				Value: []byte("\n"),
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingText, payload.Encoding)

				val, ok := (payload.DeserializedPayload).([]byte)
				require.Truef(t, ok, "parsed payload is not of type string")
				assert.Equal(t, "\n", string(val))

				assert.Equal(t, "\n", string(payload.NormalizedPayload))
			},
		},
		{
			name: "no control",
			record: &kgo.Record{
				Value: []byte(" [^[:cntrl:]]*$"),
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingText, payload.Encoding)

				val, ok := (payload.DeserializedPayload).([]byte)
				require.Truef(t, ok, "parsed payload is not of type string")
				assert.Equal(t, " [^[:cntrl:]]*$", string(val))

				assert.Equal(t, " [^[:cntrl:]]*$", string(payload.NormalizedPayload))
			},
		},
		{
			name: "no control in key",
			record: &kgo.Record{
				Key: []byte(" [^[:cntrl:]]*$"),
			},
			payloadType: PayloadTypeKey,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingText, payload.Encoding)

				val, ok := (payload.DeserializedPayload).([]byte)
				require.Truef(t, ok, "parsed payload is not of type string")
				assert.Equal(t, " [^[:cntrl:]]*$", string(val))

				assert.Equal(t, " [^[:cntrl:]]*$", string(payload.NormalizedPayload))
			},
		},
		{
			name: "Invalid UFT8",
			record: &kgo.Record{
				Value: []byte{0xff, 0xfe, 0xfd},
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				assert.Error(t, err)
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

func TestTextSerde_SerializePayload(t *testing.T) {
	serde := TextSerde{}

	tests := []struct {
		name           string
		input          any
		payloadType    PayloadType
		options        []SerdeOpt
		validationFunc func(*testing.T, []byte, error)
	}{
		{
			name:        "empty byte",
			input:       []byte(""),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []byte(""), res)
			},
		},
		{
			name:        "not empty byte",
			input:       []byte("asdf"),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []byte("asdf"), res)
			},
		},
		{
			name:        "empty string",
			input:       "",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []byte(""), res)
			},
		},
		{
			name:        "not empty string",
			input:       "asdf",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []byte("asdf"), res)
			},
		},
		{
			name:  "invalid type",
			input: map[string]interface{}{},

			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "unsupported type map[string]interface {} for text serialization", err.Error())
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			data, err := serde.SerializeObject(test.input, test.payloadType, test.options...)
			test.validationFunc(t, data, err)
		})
	}
}
