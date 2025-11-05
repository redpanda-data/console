// Copyright 2025 Redpanda Data, Inc.
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
	"encoding/json"
	"errors"
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/dynamicpb"
)

var _ Serde = (*ProtobufBSRSerde)(nil)

const (
	// BSR header keys for message type and commit
	headerBSRMessageKey = "buf.registry.value.schema.message"
	headerBSRCommitKey  = "buf.registry.value.schema.commit"
)

// ProtobufBSRSerde represents the serde for dealing with Protobuf messages
// stored with Buf Schema Registry (BSR) metadata in record headers.
type ProtobufBSRSerde struct {
	bsrClient BSRClient
}

// Name returns the name of the serde payload encoding.
func (ProtobufBSRSerde) Name() PayloadEncoding {
	return PayloadEncodingProtobufBSR
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
// BSR uses a different wire format than Confluent Schema Registry:
// - No magic byte or schema ID in the payload
// - Message type and commit are stored in record headers
// - Payload is just the raw protobuf binary
func (d ProtobufBSRSerde) DeserializePayload(ctx context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	if d.bsrClient == nil {
		return &RecordPayload{}, errors.New("BSR client is not configured")
	}

	// Extract payload (key or value)
	payload := payloadFromRecord(record, payloadType)
	if len(payload) == 0 {
		return &RecordPayload{}, errors.New("payload is empty")
	}

	// Extract BSR headers
	// Note: We use "value" headers even for key payloads, as BSR typically only encodes values
	// If BSR also supports key encoding, you may need to conditionally use "key" headers
	messageName, err := extractHeader(record, headerBSRMessageKey)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to extract message name from header: %w", err)
	}

	commit, err := extractHeader(record, headerBSRCommitKey)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to extract commit from header: %w", err)
	}

	// Fetch message descriptor from BSR
	messageDescriptor, err := d.bsrClient.GetMessageDescriptor(ctx, messageName, commit)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to get message descriptor from BSR: %w", err)
	}

	// Create dynamic protobuf message and unmarshal
	protoMessage := dynamicpb.NewMessage(messageDescriptor)
	err = proto.Unmarshal(payload, protoMessage)
	if err != nil {
		return nil, fmt.Errorf("unable to unmarshal protobuf encoded record: %w", err)
	}

	// Get file descriptor set for resolver
	files, err := d.bsrClient.GetFileDescriptorSet(ctx, messageName, commit)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to get file descriptor set from BSR: %w", err)
	}

	// Marshal proto message into JSON
	o := protojson.MarshalOptions{
		UseProtoNames:     false, // use lowerCamelCase
		EmitUnpopulated:   true,
		EmitDefaultValues: true,
		Resolver:          files.AsResolver(), // linker.Files.AsResolver() returns protojson.Resolver
	}
	jsonBytes, err := o.Marshal(protoMessage)
	if err != nil {
		return nil, fmt.Errorf("unable to marshal protobuf message as JSON: %w", err)
	}

	var native any
	err = json.Unmarshal(jsonBytes, &native)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to deserialize JSON payload: %w", err)
	}

	result := &RecordPayload{
		DeserializedPayload: native,
		NormalizedPayload:   jsonBytes,
		Encoding:            PayloadEncodingProtobufBSR,
		PayloadSizeBytes:    len(payload),
		// BSR doesn't use schema IDs like Confluent, so we leave SchemaID as nil
		SchemaID: nil,
	}

	return result, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
// For BSR, this would only handle the protobuf payload itself, not the headers.
// Headers must be set separately by the caller.
func (ProtobufBSRSerde) SerializeObject(_ context.Context, obj any, _ PayloadType, _ ...SerdeOpt) ([]byte, error) {
	switch v := obj.(type) {
	case proto.Message:
		b, err := proto.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize protobuf payload: %w", err)
		}
		return b, nil
	default:
		return nil, fmt.Errorf("unsupported object type for BSR serialization: %T", obj)
	}
}

// extractHeader extracts a header value from a Kafka record by key.
func extractHeader(record *kgo.Record, key string) (string, error) {
	for _, header := range record.Headers {
		if header.Key == key {
			if len(header.Value) == 0 {
				return "", fmt.Errorf("header %q is empty", key)
			}
			return string(header.Value), nil
		}
	}
	return "", fmt.Errorf("header %q not found", key)
}
