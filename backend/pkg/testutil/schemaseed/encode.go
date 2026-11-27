// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package schemaseed

import (
	"context"
	"fmt"

	"github.com/bufbuild/protocompile"
	"github.com/twmb/avro"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/dynamicpb"
)

// Location is where a key or value carries its schema locator.
type Location string

// Locations of a schema locator.
const (
	Plain       Location = "plain"
	PayloadID   Location = "payload-id"
	PayloadGUID Location = "payload-guid"
	HeaderID    Location = "header-id"
	HeaderGUID  Location = "header-guid"
)

// Record headers that carry a schema locator.
const (
	KeySchemaIDHeader   = "__key_schema_id"
	ValueSchemaIDHeader = "__value_schema_id"
)

func (l Location) inHeader() bool { return l == HeaderID || l == HeaderGUID }
func (l Location) isGUID() bool   { return l == PayloadGUID || l == HeaderGUID }

// IDLocator returns the schema ID form of a locator: 0x00, the ID, and the
// Protobuf message indexes if any.
func IDLocator(id int, index ...int) []byte {
	var h sr.ConfluentHeader
	b, _ := h.AppendEncode(nil, id, index)
	return b
}

// GUIDLocator returns the schema GUID form of a locator: 0x01, the GUID, and
// the Protobuf message indexes if any.
func GUIDLocator(guid string, index ...int) []byte {
	var h sr.ConfluentHeader
	b, err := h.AppendEncodeGUID(nil, guid, index)
	if err != nil {
		panic(err)
	}
	return b
}

// Place writes an encoded message to the key or value of rec. A payload
// location prefixes the message with the locator, a header location puts the
// locator in the schema ID record header.
func Place(rec *kgo.Record, isKey bool, loc Location, locator, message []byte) {
	payload := message
	if loc.inHeader() {
		name := ValueSchemaIDHeader
		if isKey {
			name = KeySchemaIDHeader
		}
		rec.Headers = append(rec.Headers, kgo.RecordHeader{Key: name, Value: locator})
	} else {
		payload = append(append([]byte{}, locator...), message...)
	}
	if isKey {
		rec.Key = payload
		return
	}
	rec.Value = payload
}

// encoded is a message encoded with a fixture schema.
type encoded struct {
	schema  *Schema
	message []byte
	index   []int  // Protobuf message indexes, nil for Avro and JSON
	json    string // the decoded message as Console shows it
}

func (e encoded) locator(loc Location) []byte {
	if loc.isGUID() {
		return GUIDLocator(e.schema.GUID, e.index...)
	}
	return IDLocator(e.schema.ID, e.index...)
}

func encodeAvro(s *Schema, sample string) (encoded, error) {
	sch, err := avro.Parse(s.Text)
	if err != nil {
		return encoded{}, fmt.Errorf("parsing avro schema %s: %w", s.Subject, err)
	}
	var native any
	if err := sch.DecodeJSON([]byte(sample), &native); err != nil {
		return encoded{}, fmt.Errorf("reading avro sample for %s: %w", s.Subject, err)
	}
	b, err := sch.Encode(native)
	if err != nil {
		return encoded{}, fmt.Errorf("encoding avro sample for %s: %w", s.Subject, err)
	}
	return encoded{schema: s, message: b, json: sample}, nil
}

func encodeJSON(s *Schema, sample string) encoded {
	return encoded{schema: s, message: []byte(sample), json: sample}
}

// encodeProto encodes a protojson sample as the message at index in the
// schema's file. imports holds the text of referenced files by name.
func encodeProto(s *Schema, imports map[string]string, sample string, index ...int) (encoded, error) {
	const mainFile = "main.proto"
	files := map[string]string{mainFile: s.Text}
	for name, text := range imports {
		files[name] = text
	}
	compiler := protocompile.Compiler{
		Resolver: protocompile.WithStandardImports(&protocompile.SourceResolver{
			Accessor: protocompile.SourceAccessorFromMap(files),
		}),
	}
	compiled, err := compiler.Compile(context.Background(), mainFile)
	if err != nil {
		return encoded{}, fmt.Errorf("compiling proto schema %s: %w", s.Subject, err)
	}

	var md protoreflect.MessageDescriptor
	messages := compiled.FindFileByPath(mainFile).Messages()
	for _, i := range index {
		if i >= messages.Len() {
			return encoded{}, fmt.Errorf("message index %v out of range in %s", index, s.Subject)
		}
		md = messages.Get(i)
		messages = md.Messages()
	}
	if md == nil {
		return encoded{}, fmt.Errorf("no message index for %s", s.Subject)
	}

	msg := dynamicpb.NewMessage(md)
	if err := (protojson.UnmarshalOptions{Resolver: compiled.AsResolver()}).Unmarshal([]byte(sample), msg); err != nil {
		return encoded{}, fmt.Errorf("reading proto sample for %s: %w", s.Subject, err)
	}
	b, err := proto.MarshalOptions{Deterministic: true}.Marshal(msg)
	if err != nil {
		return encoded{}, fmt.Errorf("encoding proto sample for %s: %w", s.Subject, err)
	}
	return encoded{schema: s, message: b, index: index, json: sample}, nil
}
