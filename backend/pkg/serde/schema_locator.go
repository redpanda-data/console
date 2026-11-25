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

// Record headers that carry the schema ID or GUID of the key or value in
// place of the payload prefix.
const (
	keySchemaIDHeader   = "__key_schema_id"
	valueSchemaIDHeader = "__value_schema_id"
)

const (
	schemaIDMagicByte   = 0x00
	schemaIDSize        = 5 // magic byte and a 4-byte ID
	schemaGUIDMagicByte = 0x01
	schemaGUIDSize      = 17 // magic byte and a 16-byte GUID

	// maxProtobufIndexes bounds the message index count. The bytes may not be
	// a schema registry envelope at all.
	maxProtobufIndexes = 128
)

// SchemaIDLocation is where a key or value carries its schema ID or GUID.
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

// schemaLocator is the schema ID or GUID that a key or value carries, and the
// bytes around it.
type schemaLocator struct {
	id       int    // set when guid is empty
	guid     string // lowercase text form
	location SchemaIDLocation
	trailing []byte // bytes after the locator, in the place it was read from
	payload  []byte // the whole key or value
}

// locateSchema reads the schema ID or GUID of the key or value from its record
// header, or else from the payload prefix. A header is authoritative: if it
// does not parse, the payload is not tried.
func locateSchema(record *kgo.Record, payloadType PayloadType) (schemaLocator, error) {
	payload := payloadFromRecord(record, payloadType)
	source, location := payload, SchemaIDLocationPayload
	if value, ok := schemaIDHeader(record.Headers, payloadType); ok {
		source, location = value, SchemaIDLocationHeader
	}

	var header sr.ConfluentHeader
	id, guid, trailing, err := header.DecodeIDOrGUID(source)
	if err != nil {
		if location == SchemaIDLocationHeader {
			return schemaLocator{}, fmt.Errorf("invalid %s header: %s", schemaIDHeaderName(payloadType), locatorFault(source))
		}
		return schemaLocator{}, fmt.Errorf("payload has no schema ID: %s", locatorFault(source))
	}
	return schemaLocator{id: id, guid: guid, location: location, trailing: trailing, payload: payload}, nil
}

// locatorFault says why b does not start with a schema ID or GUID.
func locatorFault(b []byte) string {
	switch {
	case len(b) == 0:
		return "it is empty"
	case b[0] == schemaIDMagicByte:
		return fmt.Sprintf("truncated schema ID, got %d of %d bytes", len(b), schemaIDSize)
	case b[0] == schemaGUIDMagicByte:
		return fmt.Sprintf("truncated schema GUID, got %d of %d bytes", len(b), schemaGUIDSize)
	default:
		return fmt.Sprintf("unknown magic byte 0x%02x", b[0])
	}
}

// resolve returns the schema ID of the locator, and ctx scoped to the schema
// registry context that the ID belongs to. An ID belongs to the context of
// ctx. A GUID is looked up: it can have an ID in several contexts, and the
// context of ctx is preferred.
func (l schemaLocator) resolve(ctx context.Context, client schema.Client) (context.Context, int, error) {
	if l.guid == "" {
		return ctx, l.id, nil
	}
	if client == nil {
		return ctx, 0, errors.New("no schema registry configured")
	}

	ids, err := client.SchemaIDsByGUID(ctx, l.guid)
	if err != nil {
		if schema.IsRouteNotFound(err) {
			return ctx, 0, errors.New("the schema registry does not support schema GUIDs, Redpanda supports them from 26.3")
		}
		return ctx, 0, fmt.Errorf("looking up schema GUID %s: %w", l.guid, err)
	}
	picked, ok := schema.PickContextID(ids, schema.ContextName(ctx))
	if !ok {
		return ctx, 0, fmt.Errorf("schema GUID %s not found", l.guid)
	}
	return schema.InContext(ctx, picked.Context), picked.ID, nil
}

// message returns the encoded Avro or JSON message.
func (l schemaLocator) message() []byte {
	if l.location == SchemaIDLocationHeader {
		return l.payload
	}
	return l.trailing
}

// protobufMessage returns the message indexes that follow the locator, and
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

// describe records on rp the schema that decoded the payload: the ID and the
// ctx that resolve returned.
func (l schemaLocator) describe(ctx context.Context, id int, rp *RecordPayload) {
	schemaID := uint32(id)
	rp.SchemaID = &schemaID
	rp.SchemaGUID = l.guid
	rp.SchemaIDLocation = l.location
	rp.SchemaContext = schema.ContextName(ctx)
}
