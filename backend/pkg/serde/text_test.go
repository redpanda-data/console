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
		payloadType    payloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "trimmed",
			record: &kgo.Record{
				Value: []byte("\n"),
			},
			payloadType: payloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, payloadEncodingText, payload.Encoding)

				val, ok := (payload.ParsedPayload).([]byte)
				require.Truef(t, ok, "parsed payload is not of type string")
				assert.Equal(t, "\n", string(val))
			},
		},
		{
			name: "no control",
			record: &kgo.Record{
				Value: []byte(" [^[:cntrl:]]*$"),
			},
			payloadType: payloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, payloadEncodingText, payload.Encoding)

				val, ok := (payload.ParsedPayload).([]byte)
				require.Truef(t, ok, "parsed payload is not of type string")
				assert.Equal(t, " [^[:cntrl:]]*$", string(val))
			},
		},
		{
			name: "no control in key",
			record: &kgo.Record{
				Key: []byte(" [^[:cntrl:]]*$"),
			},
			payloadType: payloadTypeKey,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, payloadEncodingText, payload.Encoding)

				val, ok := (payload.ParsedPayload).([]byte)
				require.Truef(t, ok, "parsed payload is not of type string")
				assert.Equal(t, " [^[:cntrl:]]*$", string(val))
			},
		},
		{
			name: "Invalid UFT8",
			record: &kgo.Record{
				Value: []byte{0xff, 0xfe, 0xfd},
			},
			payloadType: payloadTypeValue,
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
