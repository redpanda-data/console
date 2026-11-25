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

func TestLocateSchema_Header(t *testing.T) {
	var (
		idOne     = []byte{0x00, 0x00, 0x00, 0x00, 0x01}
		idTwo     = []byte{0x00, 0x00, 0x00, 0x00, 0x02}
		bare      = []byte("bare message")
		prefixed  = append(append([]byte{}, idTwo...), "msg"...)
		header    = func(key string, value []byte) kgo.RecordHeader { return kgo.RecordHeader{Key: key, Value: value} }
		valueOnly = func(headers ...kgo.RecordHeader) *kgo.Record { return &kgo.Record{Value: bare, Headers: headers} }
	)

	tests := []struct {
		name        string
		record      *kgo.Record
		payloadType PayloadType
		validateFn  func(t *testing.T, loc schemaLocator, err error)
	}{
		{
			name:        "value header, the payload is the bare message",
			record:      valueOnly(header("other", []byte("x")), header(valueSchemaIDHeader, idOne)),
			payloadType: PayloadTypeValue,
			validateFn: func(t *testing.T, loc schemaLocator, err error) {
				require.NoError(t, err)
				assert.Equal(t, 1, loc.id)
				assert.Equal(t, SchemaIDLocationHeader, loc.location)
				assert.Equal(t, bare, loc.message())
			},
		},
		{
			name:        "key header",
			record:      &kgo.Record{Key: bare, Value: prefixed, Headers: []kgo.RecordHeader{header(keySchemaIDHeader, idOne)}},
			payloadType: PayloadTypeKey,
			validateFn: func(t *testing.T, loc schemaLocator, err error) {
				require.NoError(t, err)
				assert.Equal(t, 1, loc.id)
				assert.Equal(t, SchemaIDLocationHeader, loc.location)
				assert.Equal(t, bare, loc.message())
			},
		},
		{
			name:        "the key header does not apply to the value",
			record:      &kgo.Record{Key: bare, Value: prefixed, Headers: []kgo.RecordHeader{header(keySchemaIDHeader, idOne)}},
			payloadType: PayloadTypeValue,
			validateFn: func(t *testing.T, loc schemaLocator, err error) {
				require.NoError(t, err)
				assert.Equal(t, 2, loc.id)
				assert.Equal(t, SchemaIDLocationPayload, loc.location)
				assert.Equal(t, []byte("msg"), loc.message())
			},
		},
		{
			name:        "the last header wins",
			record:      valueOnly(header(valueSchemaIDHeader, idOne), header(valueSchemaIDHeader, idTwo)),
			payloadType: PayloadTypeValue,
			validateFn: func(t *testing.T, loc schemaLocator, err error) {
				require.NoError(t, err)
				assert.Equal(t, 2, loc.id)
			},
		},
		{
			name: "a null last header selects the payload",
			record: &kgo.Record{Value: prefixed, Headers: []kgo.RecordHeader{
				header(valueSchemaIDHeader, idOne), header(valueSchemaIDHeader, nil),
			}},
			payloadType: PayloadTypeValue,
			validateFn: func(t *testing.T, loc schemaLocator, err error) {
				require.NoError(t, err)
				assert.Equal(t, 2, loc.id)
				assert.Equal(t, SchemaIDLocationPayload, loc.location)
			},
		},
		{
			name:        "a null header before a set one is ignored",
			record:      valueOnly(header(valueSchemaIDHeader, nil), header(valueSchemaIDHeader, idOne)),
			payloadType: PayloadTypeValue,
			validateFn: func(t *testing.T, loc schemaLocator, err error) {
				require.NoError(t, err)
				assert.Equal(t, 1, loc.id)
				assert.Equal(t, SchemaIDLocationHeader, loc.location)
			},
		},
		{
			name:        "an empty header fails",
			record:      valueOnly(header(valueSchemaIDHeader, []byte{})),
			payloadType: PayloadTypeValue,
			validateFn: func(t *testing.T, _ schemaLocator, err error) {
				assert.EqualError(t, err, "invalid __value_schema_id header: it is empty")
			},
		},
		{
			name: "a header that fails is not retried on the payload",
			record: &kgo.Record{Value: prefixed, Headers: []kgo.RecordHeader{
				header(valueSchemaIDHeader, []byte{0x00, 0x00}),
			}},
			payloadType: PayloadTypeValue,
			validateFn: func(t *testing.T, _ schemaLocator, err error) {
				assert.EqualError(t, err, "invalid __value_schema_id header: truncated schema ID, got 2 of 5 bytes")
			},
		},
		{
			name:        "unknown magic byte in the key header",
			record:      &kgo.Record{Key: bare, Headers: []kgo.RecordHeader{header(keySchemaIDHeader, []byte{0x07, 0x00, 0x00, 0x00, 0x01})}},
			payloadType: PayloadTypeKey,
			validateFn: func(t *testing.T, _ schemaLocator, err error) {
				assert.EqualError(t, err, "invalid __key_schema_id header: unknown magic byte 0x07")
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			loc, err := locateSchema(tc.record, tc.payloadType)
			tc.validateFn(t, loc, err)
		})
	}
}

func TestSchemaLocator_ProtobufMessageInHeader(t *testing.T) {
	record := &kgo.Record{
		Value: []byte("bare message"),
		Headers: []kgo.RecordHeader{
			{Key: valueSchemaIDHeader, Value: []byte{0x00, 0x00, 0x00, 0x00, 0x09, 0x04, 0x02, 0x06}},
		},
	}

	loc, err := locateSchema(record, PayloadTypeValue)
	require.NoError(t, err)
	index, message, err := loc.protobufMessage()
	require.NoError(t, err)
	assert.Equal(t, 9, loc.id)
	assert.Equal(t, []int{1, 3}, index)
	assert.Equal(t, []byte("bare message"), message)

	// The indexes are required. A header with the schema ID only is not enough.
	record.Headers[0].Value = []byte{0x00, 0x00, 0x00, 0x00, 0x09}
	loc, err = locateSchema(record, PayloadTypeValue)
	require.NoError(t, err)
	_, _, err = loc.protobufMessage()
	assert.ErrorContains(t, err, "buffer is too small")
}

func TestRegistrySerdesFirst(t *testing.T) {
	svc, err := NewService(nil, nil, nil, nil, config.Cbor{})
	require.NoError(t, err)

	names := func(serdes []Serde) []PayloadEncoding {
		out := make([]PayloadEncoding, len(serdes))
		for i, serde := range serdes {
			out[i] = serde.Name()
		}
		return out
	}

	reordered := names(svc.registryFirst)
	assert.Equal(t, []PayloadEncoding{
		PayloadEncodingNull,
		PayloadEncodingJSONSchema,
		PayloadEncodingAvro,
		PayloadEncodingProtobufSchema,
		PayloadEncodingJSON,
	}, reordered[:5])
	assert.ElementsMatch(t, names(svc.SerDes), reordered)
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
