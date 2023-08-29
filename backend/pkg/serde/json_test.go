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

func TestJsonSerde_DeserializePayload(t *testing.T) {
	serde := JsonSerde{}

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    PayloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "Valid JSON Object in value",
			record: &kgo.Record{
				Value: []byte(`{"name": "John", "age": 30}`),
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingJSON, payload.Encoding)

				assert.Equal(t, `{"name": "John", "age": 30}`, string(payload.NormalizedPayload))

				obj, ok := (payload.DeserializedPayload).(map[string]any)
				require.Truef(t, ok, "parsed payload is not of type map[string]any")
				assert.Equal(t, "John", obj["name"])
				assert.EqualValues(t, 30, obj["age"])
			},
		},
		{
			name: "Valid JSON Object in key",
			record: &kgo.Record{
				Key: []byte(`{"name": "John", "age": 30}`),
			},
			payloadType: PayloadTypeKey,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingJSON, payload.Encoding)
			},
		},
		{
			name: "Valid JSON Array",
			record: &kgo.Record{
				Value: []byte(`[10, 20, 30]`),
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Equal(t, PayloadEncodingJSON, payload.Encoding)
			},
		},
		{
			name: "Invalid JSON",
			record: &kgo.Record{
				Value: []byte(`this is no valid JSON`),
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
			test.validationFunc(t, *payload, err)
		})
	}
}

func TestJsonSerde_SerializeObject(t *testing.T) {
	serde := JsonSerde{}

	tests := []struct {
		name           string
		input          any
		payloadType    PayloadType
		options        []SerdeOpt
		validationFunc func(*testing.T, []byte, error)
	}{
		{
			name:        "byte: empty",
			input:       []byte(""),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "after trimming whitespaces there were no characters left", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "byte: trim",
			input:       []byte("\r\n"),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "after trimming whitespaces there were no characters left", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "string: empty",
			input:       "",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "after trimming whitespaces there were no characters left", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "string: trim",
			input:       "\r\n",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "after trimming whitespaces there were no characters left", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "byte: invalid json",
			input:       []byte("asdf"),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "first byte indicates this it not valid JSON, expected brackets", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "string: invalid json",
			input:       "asdf",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "first byte indicates this it not valid JSON, expected brackets", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "byte: valid json",
			input:       []byte(`{"foo":"bar"}`),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []byte(`{"foo":"bar"}`), res)
			},
		},
		{
			name:        "string: valid json",
			input:       `{"foo":"bar"}`,
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []byte(`{"foo":"bar"}`), res)
			},
		},
		{
			name:        "byte: valid json array",
			input:       []byte(`["foo", "bar"]`),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []byte(`["foo", "bar"]`), res)
			},
		},
		{
			name:        "string: valid json array",
			input:       `["foo", "bar"]`,
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []byte(`["foo", "bar"]`), res)
			},
		},
		{
			name: "map",
			input: map[string]interface{}{
				"foo": "bar",
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []byte(`{"foo":"bar"}`), res)
			},
		},
		{
			name:        "slice",
			input:       []string{"foo", "bar"},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []byte(`["foo","bar"]`), res)
			},
		},
		{
			name:        "string",
			input:       "foo",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "first byte indicates this it not valid JSON, expected brackets", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "int",
			input:       123,
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "first byte indicates this it not valid JSON, expected brackets", err.Error())
				assert.Nil(t, res)
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
