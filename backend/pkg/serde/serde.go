// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package serde provides an abstraction layer for serializing and deserializing
// Kafka records.
package serde

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"strings"

	"github.com/twmb/franz-go/pkg/kgo"
)

type serdeCfg struct {
	schemaID uint32

	schemaPath string

	index    []int
	indexSet bool

	topic string

	uintSize    UintSize
	uintSizeSet bool
}

type (
	// SerdeOpt is an option to configure a Serde.
	SerdeOpt interface{ apply(*serdeCfg) } //nolint:revive // stuttering
	serdeOpt struct{ fn func(*serdeCfg) }
)

func (o serdeOpt) apply(t *serdeCfg) { o.fn(t) }

// WithIndex adds a message index to serde options. Useful for Protobuf serialization and deserialization.
func WithIndex(index ...int) SerdeOpt {
	return serdeOpt{func(t *serdeCfg) {
		t.index = index
		t.indexSet = true
	}}
}

// WithSchemaID adds a schema ID to serde options.
func WithSchemaID(id uint32) SerdeOpt {
	return serdeOpt{func(t *serdeCfg) {
		if id > 0 {
			t.schemaID = id
		}
	}}
}

// WithSchemaPath adds a schema path to serde options.
func WithSchemaPath(path string) SerdeOpt {
	return serdeOpt{func(t *serdeCfg) { t.schemaPath = path }}
}

// WithTopic adds a topic name to serde options.
func WithTopic(topic string) SerdeOpt {
	return serdeOpt{func(t *serdeCfg) { t.topic = topic }}
}

// WithUintSize adds the uint size to use for serialization and deserialization of numeric payloads.
func WithUintSize(size UintSize) SerdeOpt {
	return serdeOpt{func(t *serdeCfg) {
		t.uintSize = size
		t.uintSizeSet = true
	}}
}

// Serde is the generic serde interface that all type serdes implement.
type Serde interface {
	// Name returns the serde's display name. The name may be displayed in the frontend
	// for example when troubleshooting is enabled.
	Name() PayloadEncoding

	// DeserializePayload is a method to deserialize either the
	// key or value into our own Record format that can be processed by the
	// Console frontend.
	DeserializePayload(ctx context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error)

	// For completeness we can define an interface that can be implemented by each Serde so that
	// serialization could also be implemented. These would then be used when we want to produce
	// records via Console. This may be a little trickier to define as the common
	// requirements across all strategies for serializing records are less known. For example
	// some serializers may want to write metadata in Record Headers
	SerializeObject(ctx context.Context, obj any, payloadType PayloadType, opts ...SerdeOpt) ([]byte, error)
}

// from franz-go

// AppendEncode appends an encoded header to b according to the Confluent wire
// format and returns it. Error is always nil.
//
//nolint:unparam // we always pass nil
func appendEncode(b []byte, id int, index []int) ([]byte, error) {
	b = append(
		b,
		0,
		byte(id>>24),
		byte(id>>16),
		byte(id>>8),
		byte(id>>0),
	)

	if len(index) > 0 {
		if len(index) == 1 && index[0] == 0 {
			b = append(b, 0) // first-index shortcut (one type in the protobuf)
		} else {
			b = binary.AppendVarint(b, int64(len(index)))
			for _, idx := range index {
				b = binary.AppendVarint(b, int64(idx))
			}
		}
	}

	return b, nil
}

func trimJSONInputString(v string) (string, bool, error) {
	trimmed := strings.TrimLeft(v, " \t\r\n")

	if trimmed == "" {
		return "", false, errors.New("string payload is empty after trimming whitespace")
	}

	return trimmed, trimmed[0] == '[' || trimmed[0] == '{', nil
}

func trimJSONInput(v []byte) ([]byte, bool, error) {
	trimmed := bytes.TrimLeft(v, " \t\r\n")

	if len(trimmed) == 0 {
		return nil, false, errors.New("payload is empty after trimming whitespace")
	}

	return trimmed, trimmed[0] == '[' || trimmed[0] == '{', nil
}
