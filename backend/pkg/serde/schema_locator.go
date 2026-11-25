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
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"slices"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"

	"github.com/redpanda-data/console/backend/pkg/schema"
)

// Record headers that carry the schema ID of the key or value in place of
// the payload prefix.
const (
	keySchemaIDHeader   = "__key_schema_id"
	valueSchemaIDHeader = "__value_schema_id"
)

const (
	schemaIDMagicByte = 0x00
	schemaIDSize      = 5 // magic byte and a 4-byte ID

	// maxProtobufIndexes bounds the message index count. The bytes may not be
	// a schema registry envelope at all.
	maxProtobufIndexes = 128
)

// SchemaIDLocation is where a key or value carries its schema ID.
type SchemaIDLocation string

const (
	// SchemaIDLocationPayload is a schema ID that prefixes the payload.
	SchemaIDLocationPayload SchemaIDLocation = "payload"
	// SchemaIDLocationHeader is a schema ID in a record header.
	SchemaIDLocationHeader SchemaIDLocation = "header"
)

func schemaIDHeaderName(payloadType PayloadType) string {
	if payloadType == PayloadTypeKey {
		return keySchemaIDHeader
	}
	return valueSchemaIDHeader
}

// schemaIDHeader returns the value of the last schema ID header for the key
// or value. ok is false when there is none or its value is null, which
// selects the payload. An empty value is returned and then fails to parse.
// This is the broker's rule.
func schemaIDHeader(headers []kgo.RecordHeader, payloadType PayloadType) (value []byte, ok bool) {
	name := schemaIDHeaderName(payloadType)
	for _, h := range slices.Backward(headers) {
		if h.Key == name {
			return h.Value, h.Value != nil
		}
	}
	return nil, false
}

// schemaLocator is the schema ID that a key or value carries, and the bytes
// around it.
type schemaLocator struct {
	id       int
	location SchemaIDLocation
	trailing []byte // bytes after the schema ID, in the place it was read from
	payload  []byte // the whole key or value
}

// locateSchema reads the schema ID of the key or value from its record header,
// or else from the payload prefix. A header is authoritative: if it does not
// parse, the payload is not tried.
func locateSchema(record *kgo.Record, payloadType PayloadType) (schemaLocator, error) {
	payload := payloadFromRecord(record, payloadType)
	source, location := payload, SchemaIDLocationPayload
	if value, ok := schemaIDHeader(record.Headers, payloadType); ok {
		source, location = value, SchemaIDLocationHeader
	}

	var header sr.ConfluentHeader
	id, trailing, err := header.DecodeID(source)
	if err != nil {
		if location == SchemaIDLocationHeader {
			return schemaLocator{}, fmt.Errorf("invalid %s header: %s", schemaIDHeaderName(payloadType), schemaIDFault(source))
		}
		return schemaLocator{}, fmt.Errorf("payload has no schema ID: %s", schemaIDFault(source))
	}
	return schemaLocator{id: id, location: location, trailing: trailing, payload: payload}, nil
}

// schemaIDFault says why b does not start with a schema ID.
func schemaIDFault(b []byte) string {
	switch {
	case len(b) == 0:
		return "it is empty"
	case b[0] != schemaIDMagicByte:
		return fmt.Sprintf("unknown magic byte 0x%02x", b[0])
	case len(b) < schemaIDSize:
		return fmt.Sprintf("truncated schema ID, got %d of %d bytes", len(b), schemaIDSize)
	default:
		return "invalid schema ID"
	}
}

// message returns the encoded Avro or JSON message.
func (l schemaLocator) message() []byte {
	if l.location == SchemaIDLocationHeader {
		return l.payload
	}
	return l.trailing
}

// protobufMessage returns the message indexes that follow the schema ID, and
// the encoded Protobuf message. With a header the indexes are in the header
// and the payload is the bare message.
func (l schemaLocator) protobufMessage() ([]int, []byte, error) {
	count, n := binary.Varint(l.trailing)
	if n <= 0 {
		reason := "buffer is too small"
		if n < 0 {
			reason = "buffer overflow"
		}
		return nil, nil, fmt.Errorf("failed decoding protobuf index path (unexpected arr length): %s", reason)
	}
	if count > maxProtobufIndexes || count < 0 {
		return nil, nil, errors.New("failed decoding protobuf index path: arr length is out of expected bounds, unlikely a legit envelope")
	}

	var header sr.ConfluentHeader
	index, message, err := header.DecodeIndex(l.trailing, int(count))
	if err != nil {
		return nil, nil, fmt.Errorf("failed decoding protobuf index path: %w", err)
	}
	if l.location == SchemaIDLocationHeader {
		return index, l.payload, nil
	}
	return index, message, nil
}

// describe records on rp the schema that decoded the payload. ctx carries the
// schema registry context that the ID was resolved in.
func (l schemaLocator) describe(ctx context.Context, rp *RecordPayload) {
	id := uint32(l.id)
	rp.SchemaID = &id
	rp.SchemaIDLocation = l.location
	rp.SchemaContext = schema.ContextName(ctx)
}
