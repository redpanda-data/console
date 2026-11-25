// Copyright 2026 Redpanda Data, Inc.
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

	"github.com/redpanda-data/console/backend/pkg/config"
)

func TestLocateSchema(t *testing.T) {
	tests := []struct {
		name       string
		payload    []byte
		validateFn func(t *testing.T, loc schemaLocator, err error)
	}{
		{
			name:    "schema ID and message",
			payload: []byte{0x00, 0x00, 0x00, 0x01, 0x02, 'm', 's', 'g'},
			validateFn: func(t *testing.T, loc schemaLocator, err error) {
				require.NoError(t, err)
				assert.Equal(t, 258, loc.id)
				assert.Equal(t, []byte("msg"), loc.message())
			},
		},
		{
			name:    "schema ID and an empty message",
			payload: []byte{0x00, 0x00, 0x00, 0x00, 0x07},
			validateFn: func(t *testing.T, loc schemaLocator, err error) {
				require.NoError(t, err)
				assert.Equal(t, 7, loc.id)
				assert.Empty(t, loc.message())
			},
		},
		{
			name:    "empty payload",
			payload: []byte{},
			validateFn: func(t *testing.T, _ schemaLocator, err error) {
				assert.EqualError(t, err, "payload has no schema ID: it is empty")
			},
		},
		{
			name:    "null payload",
			payload: nil,
			validateFn: func(t *testing.T, _ schemaLocator, err error) {
				assert.EqualError(t, err, "payload has no schema ID: it is empty")
			},
		},
		{
			name:    "truncated schema ID",
			payload: []byte{0x00, 0x00, 0x00},
			validateFn: func(t *testing.T, _ schemaLocator, err error) {
				assert.EqualError(t, err, "payload has no schema ID: truncated schema ID, got 3 of 5 bytes")
			},
		},
		{
			name:    "unknown magic byte",
			payload: []byte{0x02, 0x00, 0x00, 0x00, 0x01, 'm'},
			validateFn: func(t *testing.T, _ schemaLocator, err error) {
				assert.EqualError(t, err, "payload has no schema ID: unknown magic byte 0x02")
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			for _, payloadType := range []PayloadType{PayloadTypeKey, PayloadTypeValue} {
				record := &kgo.Record{Key: tc.payload, Value: tc.payload}
				loc, err := locateSchema(record, payloadType)
				tc.validateFn(t, loc, err)
			}
		})
	}
}

func TestSchemaLocator_ProtobufMessage(t *testing.T) {
	tests := []struct {
		name       string
		trailing   []byte
		validateFn func(t *testing.T, index []int, message []byte, err error)
	}{
		{
			name:     "single zero byte is the first message",
			trailing: []byte{0x00, 'm', 's', 'g'},
			validateFn: func(t *testing.T, index []int, message []byte, err error) {
				require.NoError(t, err)
				assert.Equal(t, []int{0}, index)
				assert.Equal(t, []byte("msg"), message)
			},
		},
		{
			name:     "nested message indexes",
			trailing: []byte{0x04, 0x02, 0x06, 'm'},
			validateFn: func(t *testing.T, index []int, message []byte, err error) {
				require.NoError(t, err)
				assert.Equal(t, []int{1, 3}, index)
				assert.Equal(t, []byte("m"), message)
			},
		},
		{
			name:     "no bytes",
			trailing: nil,
			validateFn: func(t *testing.T, _ []int, _ []byte, err error) {
				assert.ErrorContains(t, err, "buffer is too small")
			},
		},
		{
			name:     "negative index count",
			trailing: []byte{0x7f},
			validateFn: func(t *testing.T, _ []int, _ []byte, err error) {
				assert.ErrorContains(t, err, "out of expected bounds")
			},
		},
		{
			name:     "index count over the limit",
			trailing: []byte{0x90, 0x03, 0x00},
			validateFn: func(t *testing.T, _ []int, _ []byte, err error) {
				assert.ErrorContains(t, err, "out of expected bounds")
			},
		},
		{
			name:     "fewer indexes than the count",
			trailing: []byte{0x04, 0x02},
			validateFn: func(t *testing.T, _ []int, _ []byte, err error) {
				assert.ErrorContains(t, err, "failed decoding protobuf index path")
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			index, message, err := schemaLocator{trailing: tc.trailing}.protobufMessage()
			tc.validateFn(t, index, message, err)
		})
	}
}

// A serde that fails must not leave the service without a payload to report.
func TestService_DeserializeRecordWithFailedSpecificEncoding(t *testing.T) {
	svc, err := NewService(nil, nil, nil, nil, config.Cbor{})
	require.NoError(t, err)

	record := &kgo.Record{Value: []byte{0x00, 0x00, 0x00, 0x00, 0x01, 0x90, 0x03}}

	tests := []struct {
		name     string
		encoding PayloadEncoding
	}{
		{name: "registry serde that fails", encoding: PayloadEncodingProtobufSchema},
		{name: "encoding without a serde", encoding: PayloadEncodingConsumerOffsets},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dr := svc.DeserializeRecord(t.Context(), record, DeserializationOptions{ValueEncoding: tc.encoding})
			require.NotNil(t, dr.Value)
			assert.Equal(t, tc.encoding, dr.Value.Encoding)
			assert.Equal(t, len(record.Value), dr.Value.PayloadSizeBytes)
		})
	}
}
