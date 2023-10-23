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
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"

	v1proto "github.com/golang/protobuf/proto" //nolint:staticcheck // intentional import of old module
	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/dynamic"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
	v2proto "google.golang.org/protobuf/proto"

	"github.com/redpanda-data/console/backend/pkg/proto"
)

var _ Serde = (*ProtobufSchemaSerde)(nil)

// ProtobufSchemaSerde represents the serde for dealing with Protobuf with schema types.
type ProtobufSchemaSerde struct {
	ProtoSvc *proto.Service
}

// Name returns the name of the serde payload encoding.
func (ProtobufSchemaSerde) Name() PayloadEncoding {
	return PayloadEncodingProtobufSchema
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (d ProtobufSchemaSerde) DeserializePayload(_ context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	if d.ProtoSvc == nil {
		return &RecordPayload{}, fmt.Errorf("no protobuf file registry configured")
	}

	if !d.ProtoSvc.IsProtobufSchemaRegistryEnabled() {
		return &RecordPayload{}, fmt.Errorf("protobuf schema registry disabled")
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

	index, remainingData, err := srSerde.DecodeIndex(remainingData, 128)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("decoding protobuf index: %w", err)
	}

	fd, exists := d.ProtoSvc.GetFileDescriptorBySchemaID(schemaID)
	if !exists {
		return &RecordPayload{}, fmt.Errorf("schema ID %+v not found", schemaID)
	}

	messageTypes := fd.GetMessageTypes()
	var messageDescriptor *desc.MessageDescriptor
	for _, idx := range index {
		if idx > len(messageTypes) {
			return &RecordPayload{}, fmt.Errorf("failed to decode message type: message index is larger than the message types array length")
		}
		messageDescriptor = messageTypes[idx]
		messageTypes = messageDescriptor.GetNestedMessageTypes()
	}

	jsonBytes, err := d.ProtoSvc.DeserializeProtobufMessageToJSON(remainingData, messageDescriptor)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to serialize protobuf to json: %w", err)
	}

	var native interface{}
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
//nolint:gocognit,cyclop // lots of supported inputs.
func (d ProtobufSchemaSerde) SerializeObject(_ context.Context, obj any, _ PayloadType, opts ...SerdeOpt) ([]byte, error) {
	so := serdeCfg{}
	for _, o := range opts {
		o.apply(&so)
	}

	var binData []byte
	switch v := obj.(type) {
	case *dynamic.Message:
		b, err := v.Marshal()
		if err != nil {
			return nil, fmt.Errorf("failed to serialize dynamic protobuf payload: %w", err)
		}
		binData = b
	case v1proto.Message:
		b, err := v1proto.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize v1 protobuf payload: %w", err)
		}
		binData = b
	case v2proto.Message:
		b, err := v2proto.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize v2 protobuf payload: %w", err)
		}
		binData = b
	case map[string]any:
		if so.schemaID == 0 {
			return nil, errors.New("no schema id specified")
		}

		encoded, err := json.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize protobuf payload: %w", err)
		}

		b, err := d.ProtoSvc.SerializeJSONToConfluentProtobufMessage(encoded, int(so.schemaID), so.index)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize native protobuf payload: %w", err)
		}

		binData = b
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

		b, err := d.ProtoSvc.SerializeJSONToConfluentProtobufMessage([]byte(trimmed), int(so.schemaID), so.index)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize string protobuf payload: %w", err)
		}

		binData = b
	case []byte:
		trimmed := bytes.TrimLeft(v, " \t\r\n")
		if len(trimmed) != 0 && trimmed[0] == '[' || trimmed[0] == '{' {
			if so.schemaID == 0 {
				return nil, errors.New("no schema id specified")
			}

			b, err := d.ProtoSvc.SerializeJSONToConfluentProtobufMessage(trimmed, int(so.schemaID), so.index)
			if err != nil {
				return nil, fmt.Errorf("failed to serialize json protobuf payload: %w", err)
			}
			binData = b
		} else {
			if so.schemaID == 0 {
				return nil, errors.New("no schema id specified")
			}

			index := so.index
			if len(index) == 0 {
				index = []int{0}
			}

			_, err := d.ProtoSvc.GetMessageDescriptorForSchema(int(so.schemaID), index)
			if err != nil {
				return nil, fmt.Errorf("failed to serialize binary protobuf payload: %w", err)
			}

			binData, err = appendEncode(nil, int(so.schemaID), index)
			if err != nil {
				return nil, fmt.Errorf("failed encode binary protobuf payload: %w", err)
			}

			binData = append(binData, v...)
		}
	default:
		return nil, fmt.Errorf("unsupported type %+T for protobuf serialization", obj)
	}

	return binData, nil
}
