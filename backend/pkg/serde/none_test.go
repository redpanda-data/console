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

func TestNoneSerde_DeserializePayload(t *testing.T) {
	serde := NoneSerde{}

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    PayloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "empty",
			record: &kgo.Record{
				Value: []byte(""),
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingNone, payload.Encoding)

				assert.Equal(t, `{}`, string(payload.NormalizedPayload))

				val, ok := (payload.DeserializedPayload).([]byte)
				require.Truef(t, ok, "parsed payload is not of type string")
				assert.Equal(t, "", string(val))
			},
		},
		{
			name: "not empty",
			record: &kgo.Record{
				Value: []byte("\n"),
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

func TestNoneSerde_SerializePayload(t *testing.T) {
	serde := NoneSerde{}

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
				require.NoError(t, err)
				assert.Empty(t, res)
			},
		},
		{
			name:        "not empty byte",
			input:       []byte("asdf"),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "input not empty", err.Error())
			},
		},
		{
			name:        "empty byte json",
			input:       []byte("{}"),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.NoError(t, err)
				assert.Empty(t, res)
			},
		},
		{
			name:        "empty string",
			input:       "",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.NoError(t, err)
				assert.Empty(t, res)
			},
		},
		{
			name:        "not empty string",
			input:       "asdf",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "input not empty", err.Error())
			},
		},
		{
			name:        "empty string json",
			input:       "{}",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.NoError(t, err)
				assert.Empty(t, res)
			},
		},
		{
			name:        "empty map",
			input:       map[string]interface{}{},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.NoError(t, err)
				assert.Empty(t, res)
			},
		},
		{
			name:        "not empty map",
			input:       map[string]interface{}{"foo": "bar"},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "input not empty", err.Error())
			},
		},
		{
			name:        "unsupported type",
			input:       0,
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "unsupported type int for serialization", err.Error())
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
