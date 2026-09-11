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
	"fmt"
	"io"

	"github.com/google/uuid"
	"github.com/twmb/avro"
	"github.com/twmb/franz-go/pkg/kgo"
)

// Wire format written by the AWS Glue Schema Registry serializers. A header of
// 18 bytes precedes the payload:
//
//	byte 0     : header version, always 3
//	byte 1     : compression, 0 for none and 5 for zlib
//	bytes 2-17 : 128 bit UUID of the schema version id
//	byte 18+   : the encoded payload
//
// See AWSSchemaRegistryConstants in github.com/awslabs/aws-glue-schema-registry.
const (
	glueHeaderVersionByte   byte = 3
	glueCompressionNoneByte byte = 0
	glueCompressionZlibByte byte = 5
	glueSchemaVersionIDSize      = 16
	glueHeaderSize               = 1 + 1 + glueSchemaVersionIDSize
)

// glueSchemaVersionIDMetadataKey is the key under which the resolved Glue schema
// version id is surfaced to the frontend. RecordPayload.SchemaID cannot carry it
// because Glue identifies schema versions by UUID rather than by integer id.
const glueSchemaVersionIDMetadataKey = "glueSchemaVersionId"

var _ Serde = (*AvroGlueSerde)(nil)

// GlueSchemaRegistryClient resolves Avro schemas from the AWS Glue Schema Registry.
type GlueSchemaRegistryClient interface {
	AvroSchemaByVersionID(ctx context.Context, schemaVersionID string) (*avro.Schema, error)
}

// AvroGlueSerde deserializes Avro records that were written with the AWS Glue
// Schema Registry serializers.
type AvroGlueSerde struct {
	glueClient GlueSchemaRegistryClient
}

// Name returns the name of the serde payload encoding.
func (AvroGlueSerde) Name() PayloadEncoding {
	return PayloadEncodingAvroGlue
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (d AvroGlueSerde) DeserializePayload(ctx context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	if d.glueClient == nil {
		return &RecordPayload{}, errors.New("no AWS Glue Schema Registry configured")
	}

	payload := payloadFromRecord(record, payloadType)

	if len(payload) <= glueHeaderSize {
		return &RecordPayload{}, fmt.Errorf("payload size is <= %d", glueHeaderSize)
	}

	if payload[0] != glueHeaderVersionByte {
		return &RecordPayload{}, errors.New("incorrect header version byte for avro glue")
	}

	encoded, err := glueDecompress(payload[1], payload[glueHeaderSize:])
	if err != nil {
		return &RecordPayload{}, err
	}

	schemaVersionID, err := uuid.FromBytes(payload[2:glueHeaderSize])
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("reading glue schema version id: %w", err)
	}

	avroSch, err := d.glueClient.AvroSchemaByVersionID(ctx, schemaVersionID.String())
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("getting avro schema from AWS Glue Schema Registry: %w", err)
	}

	var obj any
	if _, err := avroSch.Decode(encoded, &obj); err != nil {
		return &RecordPayload{}, fmt.Errorf("decoding avro: %w", err)
	}

	jsonBytes, err := avroSch.EncodeJSON(obj)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("serializing avro: %w", err)
	}

	return &RecordPayload{
		NormalizedPayload:   jsonBytes,
		DeserializedPayload: obj,
		Encoding:            PayloadEncodingAvroGlue,
		ExtraMetadata: map[string]string{
			glueSchemaVersionIDMetadataKey: schemaVersionID.String(),
		},
	}, nil
}

// SerializeObject is not supported. Producing records in the AWS Glue wire
// format requires registering or resolving a schema version to embed, which
// this serde intentionally does not do.
func (AvroGlueSerde) SerializeObject(_ context.Context, _ any, _ PayloadType, _ ...SerdeOpt) ([]byte, error) {
	return nil, errors.New("serializing to the AWS Glue Schema Registry format is not supported")
}

// glueDecompress returns the payload bytes described by the given compression byte.
func glueDecompress(compression byte, payload []byte) ([]byte, error) {
	switch compression {
	case glueCompressionNoneByte:
		return payload, nil
	case glueCompressionZlibByte:
		zr, err := zlib.NewReader(bytes.NewReader(payload))
		if err != nil {
			return nil, fmt.Errorf("opening zlib reader for avro glue payload: %w", err)
		}
		defer zr.Close()

		decompressed, err := io.ReadAll(zr)
		if err != nil {
			return nil, fmt.Errorf("decompressing zlib avro glue payload: %w", err)
		}
		return decompressed, nil
	default:
		return nil, fmt.Errorf("unknown compression byte %d for avro glue", compression)
	}
}
