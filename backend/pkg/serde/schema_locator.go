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
	"encoding/binary"
	"errors"
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
)

const (
	schemaIDMagicByte = 0x00
	schemaIDSize      = 5 // magic byte and a 4-byte ID

	// maxProtobufIndexes bounds the message index count. The bytes may not be
	// a schema registry envelope at all.
	maxProtobufIndexes = 128
)

// schemaLocator is the schema ID that a key or value carries, and the bytes
// after it.
type schemaLocator struct {
	id       int
	trailing []byte
}

// locateSchema reads the schema ID that prefixes the key or value.
func locateSchema(record *kgo.Record, payloadType PayloadType) (schemaLocator, error) {
	payload := payloadFromRecord(record, payloadType)

	var header sr.ConfluentHeader
	id, trailing, err := header.DecodeID(payload)
	if err != nil {
		return schemaLocator{}, fmt.Errorf("payload has no schema ID: %s", schemaIDFault(payload))
	}
	return schemaLocator{id: id, trailing: trailing}, nil
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
	return l.trailing
}

// protobufMessage returns the message indexes that follow the schema ID, and
// the encoded Protobuf message.
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
	return index, message, nil
}
