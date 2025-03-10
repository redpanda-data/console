// Copyright 2023 Redpanda Data, Inc.
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
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jhump/protoreflect/dynamic"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/dynamicpb"

	"github.com/redpanda-data/console/backend/pkg/schema"
)

var _ Serde = (*ProtobufSchemaSerde)(nil)

// ProtobufSchemaSerde represents the serde for dealing with Protobuf with schema types.
type ProtobufSchemaSerde struct {
	schemaClient schema.Client
}

// Name returns the name of the serde payload encoding.
func (ProtobufSchemaSerde) Name() PayloadEncoding {
	return PayloadEncodingProtobufSchema
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (d ProtobufSchemaSerde) DeserializePayload(ctx context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	if d.schemaClient == nil {
		return &RecordPayload{}, fmt.Errorf("schema registry client is not configured")
	}

	payload := payloadFromRecord(record, payloadType)

	if len(payload) <= 5 {
		return &RecordPayload{}, fmt.Errorf("payload size is <= 5")
	}

	if payload[0] != byte(0) {
		return &RecordPayload{}, fmt.Errorf("incorrect magic byte for protobuf schema")
	}

	var srSerde sr.Serde
	schemaID, remainingData, err := srSerde.DecodeID(payload)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("decoding schema id: %w", err)
	}

	// Quick sanity check whether the number of indexes that denote the to be used
	// protobuf types is a reasonable number. It may not be because we are just
	// guessing that this piece of binary data may be protobuf data in wire format.
	arrLength, n := binary.Varint(remainingData)
	if n <= 0 {
		var err error
		if n == 0 {
			err = errors.New("buffer is too small")
		} else {
			err = errors.New("buffer overflow")
		}
		return &RecordPayload{}, fmt.Errorf("failed decoding protobuf index path (unexpected arr length): %w", err)
	}
	if arrLength > 128 || arrLength < 0 {
		return nil, fmt.Errorf("arrLength is out of expected bounds, unlikely a legit envelope")
	}

	indexPath, binaryPayload, err := srSerde.DecodeIndex(remainingData, int(arrLength))
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed decoding protobuf index path: %w", err)
	}

	compiledProtoFiles, rootFilename, err := d.schemaClient.ProtoFilesByID(ctx, schemaID)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed getting proto files: %w", err)
	}

	// compiledProtoFiles is one or more files that contain compiled proto types. We need to find
	// the right proto type that shall be used for decoding the binary data. The index
	// path points us to the right type inside the main proto file.
	rootDescriptors := compiledProtoFiles.FindFileByPath(rootFilename).Messages()
	messageDescriptor := messageDescriptorFromIndexPath(rootDescriptors, indexPath)

	protoMessage := dynamicpb.NewMessage(messageDescriptor)
	err = proto.Unmarshal(binaryPayload, protoMessage)
	if err != nil {
		return nil, fmt.Errorf("unable to unmarshall protobuf encoded record into the message: %w", err)
	}

	// Marshal proto message into JSON
	o := protojson.MarshalOptions{
		UseProtoNames: false, // use lowerCamelCase
		// Do not use EmitUnpopulated, so we don't emit nulls (they are ugly, and provide no benefit. they transport no information, even in "normal" json).
		EmitUnpopulated: true,
		// Instead, use EmitDefaultValues, which is new and like EmitUnpopulated, but
		// skips nulls (which we consider ugly, and provides no benefit over skipping the field)
		EmitDefaultValues: true,
		// Resolver for looking up referenced types
		Resolver: compiledProtoFiles.AsResolver(),
	}
	jsonBytes, err := o.Marshal(protoMessage)
	if err != nil {
		return nil, fmt.Errorf("unable to marshal protobuf message as JSON: %v", err)
	}

	var native any
	err = json.Unmarshal(jsonBytes, &native)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to serialize protobuf payload into JSON: %w", err)
	}

	sID := uint32(schemaID)

	return &RecordPayload{
		DeserializedPayload: native,
		NormalizedPayload:   jsonBytes,
		Encoding:            PayloadEncodingProtobuf,
		SchemaID:            &sID,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
//
//nolint:cyclop // complex logic
func (d ProtobufSchemaSerde) SerializeObject(ctx context.Context, obj any, _ PayloadType, opts ...SerdeOpt) ([]byte, error) {
	so := serdeCfg{}
	for _, o := range opts {
		o.apply(&so)
	}

	switch v := obj.(type) {
	case *dynamic.Message:
		b, err := v.Marshal()
		if err != nil {
			return nil, fmt.Errorf("failed to serialize dynamic protobuf payload: %w", err)
		}
		return b, nil
	case proto.Message:
		b, err := proto.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize protobuf payload: %w", err)
		}
		return b, nil
	case map[string]any:
		if so.schemaID == 0 {
			return nil, errors.New("no schema id specified")
		}

		encoded, err := json.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize protobuf payload: %w", err)
		}

		return d.jsonToProtobufWire(ctx, encoded, int(so.schemaID), so.index)
	case string:
		if so.schemaID == 0 {
			return nil, errors.New("no schema id specified")
		}

		trimmed, startsWithJSON, err := trimJSONInputString(v)
		if err != nil {
			return nil, err
		}
		if !startsWithJSON {
			return nil, fmt.Errorf("first byte indicates this it not valid JSON, expected brackets")
		}

		return d.jsonToProtobufWire(ctx, []byte(trimmed), int(so.schemaID), so.index)
	case []byte:
		if so.schemaID == 0 {
			return nil, errors.New("no schema id specified")
		}

		index := so.index
		if len(index) == 0 {
			index = []int{0}
		}

		return d.jsonToProtobufWire(ctx, v, int(so.schemaID), index)
	default:
		return nil, fmt.Errorf("unsupported type %+T for protobuf serialization", obj)
	}
}

func (d ProtobufSchemaSerde) jsonToProtobufWire(ctx context.Context, jsonInput []byte, schemaID int, indexPath []int) ([]byte, error) {
	if len(indexPath) == 0 {
		indexPath = []int{0}
	}

	compiledProtoFiles, rootFilename, err := d.schemaClient.ProtoFilesByID(ctx, schemaID)
	if err != nil {
		return nil, fmt.Errorf("failed getting proto files: %w", err)
	}
	rootDescriptors := compiledProtoFiles.FindFileByPath(rootFilename).Messages()
	messageDescriptor := messageDescriptorFromIndexPath(rootDescriptors, indexPath)
	message := dynamicpb.NewMessage(messageDescriptor)

	o := protojson.UnmarshalOptions{
		Resolver: compiledProtoFiles.AsResolver(),
	}
	err = o.Unmarshal(jsonInput, message)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal given payload to the specified protobuf type: %w", err)
	}

	messageSerialized, err := proto.Marshal(message)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize protobuf payload: %w", err)
	}

	// Create Protobuf wire header which contain: magic byte, schema id and the indexPath
	// This must be prepended to the plain protobuf output.
	header, _ := (&sr.ConfluentHeader{}).AppendEncode(nil, schemaID, indexPathFromDescriptor(messageDescriptor))

	return append(header, messageSerialized...), nil
}

// indexPathFromDescriptor traverses the message descriptor hierarchy to generate
// a list of indexes representing the path to the current descriptor in the wire format.
func indexPathFromDescriptor(descriptor protoreflect.MessageDescriptor) []int {
	var path []int
	for current := descriptor; current != nil; {
		path = append([]int{current.Index()}, path...)
		parent, ok := current.Parent().(protoreflect.MessageDescriptor)
		if !ok {
			break // Reached the root, which is a FileDescriptor, so exit.
		}
		current = parent
	}
	return path
}

// messageDescriptorFromIndexPath recursively navigates through the descriptors
// to find the message descriptor specified by the given index path.
func messageDescriptorFromIndexPath(descriptors protoreflect.MessageDescriptors, indexPath []int) protoreflect.MessageDescriptor {
	// Base case: return the descriptor if we've reached the last index.
	if len(indexPath) == 1 {
		return descriptors.Get(indexPath[0])
	}

	// Recursive case: continue to the next level of descriptors.
	nextDescriptor := descriptors.Get(indexPath[0])
	return messageDescriptorFromIndexPath(nextDescriptor.Messages(), indexPath[1:])
}
