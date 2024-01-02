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
	"context"
	"testing"
	"unicode/utf8"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
)

func TestUTF8Serde_DeserializePayload(t *testing.T) {
	serde := UTF8Serde{}

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    PayloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "Valid UTF8 in value",
			record: &kgo.Record{
				Value: []byte("Hello, 世界"),
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingUtf8WithControlChars, payload.Encoding)

				val, ok := (payload.DeserializedPayload).([]byte)
				require.Truef(t, ok, "parsed payload is not of type string")
				assert.Equal(t, "Hello, 世界", string(val))
				assert.EqualValuesf(t, payload.DeserializedPayload, payload.NormalizedPayload, "expected desserialized and normalized payload to be equal")
			},
		},
		{
			name: "Valid UTF8 in key",
			record: &kgo.Record{
				Key: utf8.AppendRune([]byte("init"), 0x10000),
			},
			payloadType: PayloadTypeKey,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingUtf8WithControlChars, payload.Encoding)

				val, ok := (payload.DeserializedPayload).([]byte)
				require.Truef(t, ok, "parsed payload is not of type string")
				assert.Equal(t, "init𐀀", string(val))
				assert.EqualValuesf(t, payload.DeserializedPayload, payload.NormalizedPayload, "expected desserialized and normalized payload to be equal")
			},
		},
		{
			name: "trimmed",
			record: &kgo.Record{
				Value: []byte("\n"),
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				assert.Error(t, err)
			},
		},
		{
			name: "no control",
			record: &kgo.Record{
				Value: []byte(" [^[:cntrl:]]*$"),
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				assert.Error(t, err)
				assert.Equal(t, "payload does not contain UTF8 control characters", err.Error())
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
				assert.Equal(t, "payload is not UTF8", err.Error())
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload, err := serde.DeserializePayload(context.Background(), test.record, test.payloadType)
			test.validationFunc(t, *payload, err)
		})
	}
}

func TestUTF8Serde_SerializeObject(t *testing.T) {
	serde := UTF8Serde{}

	tests := []struct {
		name           string
		input          any
		payloadType    PayloadType
		options        []SerdeOpt
		validationFunc func(*testing.T, []byte, error)
	}{
		{
			name:        "byte: empty byte",
			input:       []byte(""),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "after trimming whitespaces there were no characters left", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "byte: trimmed",
			input:       []byte("\n"),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "after trimming whitespaces there were no characters left", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "byte: no control",
			input:       []byte(" [^[:cntrl:]]*$"),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "payload does not contain UTF8 control characters", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "byte: invalid UTF8",
			input:       []byte{0xff, 0xfe, 0xfd},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "payload is not UTF8", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "byte: valid",
			input:       []byte("Hello, 世界"),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []byte("Hello, 世界"), res)
			},
		},
		{
			name:        "invalid type",
			input:       map[string]any{},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "unsupported type map[string]interface {} for text serialization", err.Error())
			},
		},
		{
			name:        "string: empty byte",
			input:       "",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "after trimming whitespaces there were no characters left", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "string: trimmed",
			input:       "\n",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "after trimming whitespaces there were no characters left", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "string: no control",
			input:       " [^[:cntrl:]]*$",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "payload does not contain UTF8 control characters", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "string: valid",
			input:       "Hello, 世界",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []byte("Hello, 世界"), res)
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			data, err := serde.SerializeObject(context.Background(), test.input, test.payloadType, test.options...)
			test.validationFunc(t, data, err)
		})
	}
}
