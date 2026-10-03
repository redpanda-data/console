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
	"bytes"
	"compress/zlib"
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/avro"
	"github.com/twmb/franz-go/pkg/kgo"
)

// fakeGlueClient implements GlueSchemaRegistryClient for testing.
type fakeGlueClient struct {
	schema *avro.Schema
	err    error

	// requestedVersionID records the last schema version id that was asked for.
	requestedVersionID string
}

func (f *fakeGlueClient) AvroSchemaByVersionID(_ context.Context, schemaVersionID string) (*avro.Schema, error) {
	f.requestedVersionID = schemaVersionID
	if f.err != nil {
		return nil, f.err
	}
	return f.schema, nil
}

// glueTestPayload builds a record payload in the AWS Glue wire format.
func glueTestPayload(t *testing.T, headerVersion, compression byte, schemaVersionID uuid.UUID, body []byte) []byte {
	t.Helper()

	if compression == glueCompressionZlibByte {
		var buf bytes.Buffer
		zw := zlib.NewWriter(&buf)
		_, err := zw.Write(body)
		require.NoError(t, err)
		require.NoError(t, zw.Close())
		body = buf.Bytes()
	}

	payload := make([]byte, 0, glueHeaderSize+len(body))
	payload = append(payload, headerVersion, compression)
	payload = append(payload, schemaVersionID[:]...)
	payload = append(payload, body...)
	return payload
}

func TestAvroGlueSerde_DeserializePayload(t *testing.T) {
	schemaStr := `{
		"type": "record",
		"name": "simple",
		"namespace": "org.hamba.avro",
		"fields" : [
			{"name": "a", "type": "long"},
			{"name": "b", "type": "string"}
		]
	}`

	avroSchema, err := avro.Parse(schemaStr)
	require.NoError(t, err)

	type SimpleRecord struct {
		A int64  `avro:"a"`
		B string `avro:"b"`
	}

	schemaVersionID := uuid.MustParse("b7f9c0ce-4e4b-4a3f-9a0b-2c7d1e5f8a11")

	encodedBody, err := avroSchema.Encode(&SimpleRecord{A: 27, B: "foo"})
	require.NoError(t, err)

	tests := []struct {
		name           string
		record         *kgo.Record
		glueClient     GlueSchemaRegistryClient
		payloadType    PayloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "uncompressed avro glue payload in value",
			record: &kgo.Record{
				Value: glueTestPayload(t, glueHeaderVersionByte, glueCompressionNoneByte, schemaVersionID, encodedBody),
			},
			glueClient:  &fakeGlueClient{schema: avroSchema},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Equal(t, PayloadEncodingAvroGlue, payload.Encoding)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, schemaVersionID.String(), payload.ExtraMetadata[glueSchemaVersionIDMetadataKey])
				assert.JSONEq(t, `{"a":27,"b":"foo"}`, string(payload.NormalizedPayload))
			},
		},
		{
			name: "zlib compressed avro glue payload",
			record: &kgo.Record{
				Value: glueTestPayload(t, glueHeaderVersionByte, glueCompressionZlibByte, schemaVersionID, encodedBody),
			},
			glueClient:  &fakeGlueClient{schema: avroSchema},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Equal(t, PayloadEncodingAvroGlue, payload.Encoding)
				assert.JSONEq(t, `{"a":27,"b":"foo"}`, string(payload.NormalizedPayload))
			},
		},
		{
			name: "avro glue payload in key",
			record: &kgo.Record{
				Key: glueTestPayload(t, glueHeaderVersionByte, glueCompressionNoneByte, schemaVersionID, encodedBody),
			},
			glueClient:  &fakeGlueClient{schema: avroSchema},
			payloadType: PayloadTypeKey,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.JSONEq(t, `{"a":27,"b":"foo"}`, string(payload.NormalizedPayload))
			},
		},
		{
			name:        "no glue client configured",
			record:      &kgo.Record{Value: glueTestPayload(t, glueHeaderVersionByte, glueCompressionNoneByte, schemaVersionID, encodedBody)},
			glueClient:  nil,
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, _ RecordPayload, err error) {
				require.Error(t, err)
				assert.Equal(t, "no AWS Glue Schema Registry configured", err.Error())
			},
		},
		{
			name:        "payload too short",
			record:      &kgo.Record{Value: []byte{glueHeaderVersionByte, glueCompressionNoneByte, 0x01}},
			glueClient:  &fakeGlueClient{schema: avroSchema},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, _ RecordPayload, err error) {
				require.Error(t, err)
				assert.Equal(t, "payload size is <= 18", err.Error())
			},
		},
		{
			name: "confluent magic byte is rejected",
			record: &kgo.Record{
				Value: glueTestPayload(t, 0x00, glueCompressionNoneByte, schemaVersionID, encodedBody),
			},
			glueClient:  &fakeGlueClient{schema: avroSchema},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, _ RecordPayload, err error) {
				require.Error(t, err)
				assert.Equal(t, "incorrect header version byte for avro glue", err.Error())
			},
		},
		{
			name: "unknown compression byte",
			record: &kgo.Record{
				Value: glueTestPayload(t, glueHeaderVersionByte, 0x09, schemaVersionID, encodedBody),
			},
			glueClient:  &fakeGlueClient{schema: avroSchema},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, _ RecordPayload, err error) {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "unknown compression byte 9 for avro glue")
			},
		},
		{
			name: "schema lookup fails",
			record: &kgo.Record{
				Value: glueTestPayload(t, glueHeaderVersionByte, glueCompressionNoneByte, schemaVersionID, encodedBody),
			},
			glueClient:  &fakeGlueClient{err: errors.New("access denied")},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, _ RecordPayload, err error) {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "getting avro schema from AWS Glue Schema Registry")
				assert.Contains(t, err.Error(), "access denied")
			},
		},
		{
			name: "payload does not match schema",
			record: &kgo.Record{
				Value: glueTestPayload(t, glueHeaderVersionByte, glueCompressionNoneByte, schemaVersionID, []byte{0xff, 0xff, 0xff}),
			},
			glueClient:  &fakeGlueClient{schema: avroSchema},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, _ RecordPayload, err error) {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "decoding avro")
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			serde := AvroGlueSerde{glueClient: test.glueClient}
			payload, err := serde.DeserializePayload(t.Context(), test.record, test.payloadType)
			test.validationFunc(t, *payload, err)
		})
	}
}

func TestAvroGlueSerde_SchemaVersionIDIsForwarded(t *testing.T) {
	schemaStr := `{"type":"record","name":"simple","fields":[{"name":"a","type":"long"}]}`
	avroSchema, err := avro.Parse(schemaStr)
	require.NoError(t, err)

	type OneFieldRecord struct {
		A int64 `avro:"a"`
	}

	encodedBody, err := avroSchema.Encode(&OneFieldRecord{A: 1})
	require.NoError(t, err)

	schemaVersionID := uuid.MustParse("00112233-4455-6677-8899-aabbccddeeff")
	client := &fakeGlueClient{schema: avroSchema}

	serde := AvroGlueSerde{glueClient: client}
	_, err = serde.DeserializePayload(t.Context(),
		&kgo.Record{Value: glueTestPayload(t, glueHeaderVersionByte, glueCompressionNoneByte, schemaVersionID, encodedBody)},
		PayloadTypeValue)
	require.NoError(t, err)

	// The UUID must be read big endian out of bytes 2..18 so that it matches the
	// id that the AWS serializers wrote.
	assert.Equal(t, "00112233-4455-6677-8899-aabbccddeeff", client.requestedVersionID)
}

func TestAvroGlueSerde_SerializeObject(t *testing.T) {
	serde := AvroGlueSerde{glueClient: &fakeGlueClient{}}

	_, err := serde.SerializeObject(t.Context(), map[string]any{"a": 1}, PayloadTypeValue)
	require.Error(t, err)
	assert.Equal(t, "serializing to the AWS Glue Schema Registry format is not supported", err.Error())
}

func TestAvroGlueSerde_Name(t *testing.T) {
	assert.Equal(t, PayloadEncodingAvroGlue, AvroGlueSerde{}.Name())
}
