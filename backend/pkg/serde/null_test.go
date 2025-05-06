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

func TestNullSerde_DeserializePayload(t *testing.T) {
	serde := NullSerde{}

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    PayloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "nil payload",
			record: &kgo.Record{
				Value: nil,
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingNull, payload.Encoding)

				assert.Nil(t, payload.NormalizedPayload)
				assert.Nil(t, payload.DeserializedPayload)
			},
		},
		{
			name: "empty byte array",
			record: &kgo.Record{
				Value: []byte(""),
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, _ RecordPayload, err error) {
				assert.Error(t, err)
			},
		},
		{
			name: "not empty",
			record: &kgo.Record{
				Value: []byte("\n"),
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, _ RecordPayload, err error) {
				assert.Error(t, err)
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload, err := serde.DeserializePayload(t.Context(), test.record, test.payloadType)
			test.validationFunc(t, *payload, err)
		})
	}
}

func TestNullSerde_SerializeObject(t *testing.T) {
	serde := NullSerde{}

	tests := []struct {
		name           string
		input          any
		payloadType    PayloadType
		options        []SerdeOpt
		validationFunc func(*testing.T, []byte, error)
	}{
		{
			name:        "empty string byte",
			input:       []byte(""),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Nil(t, res)
			},
		},
		{
			name:        "not empty byte",
			input:       []byte("asdf"),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Nil(t, res)
			},
		},
		{
			name:        "empty byte json",
			input:       []byte("{}"),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Nil(t, res)
			},
		},
		{
			name:        "empty string",
			input:       "",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Nil(t, res)
			},
		},
		{
			name:        "not empty string",
			input:       "asdf",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Nil(t, res)
			},
		},
		{
			name:        "nil",
			input:       nil,
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Nil(t, res)
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			data, err := serde.SerializeObject(t.Context(), test.input, test.payloadType, test.options...)
			test.validationFunc(t, data, err)
		})
	}
}
