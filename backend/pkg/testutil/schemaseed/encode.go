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
	"github.com/twmb/franz-go/pkg/sr"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/dynamicpb"
)

// Location is where a key or value carries its schema ID.
type Location string

// Locations of a schema ID.
const (
	Plain     Location = "plain"
	PayloadID Location = "payload-id"
)

// IDLocator returns a schema ID in the Confluent wire format: 0x00, the ID,
// and the Protobuf message indexes if any.
func IDLocator(id int, index ...int) []byte {
	var h sr.ConfluentHeader
	b, _ := h.AppendEncode(nil, id, index)
	return b
}

// encoded is a message encoded with a fixture schema.
type encoded struct {
	schema  *Schema
	message []byte
	index   []int  // Protobuf message indexes, nil for Avro and JSON
	json    string // the decoded message as Console shows it
}

// payload returns the message with its schema ID in front.
func (e encoded) payload() []byte {
	return append(IDLocator(e.schema.ID, e.index...), e.message...)
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
