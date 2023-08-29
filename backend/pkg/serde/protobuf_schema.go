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
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	v1proto "github.com/golang/protobuf/proto"
	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/dynamic"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
	v2proto "google.golang.org/protobuf/proto"

	"github.com/redpanda-data/console/backend/pkg/proto"
)

var _ Serde = (*ProtobufSchemaSerde)(nil)

type ProtobufSchemaSerde struct {
	ProtoSvc *proto.Service
}

func (ProtobufSchemaSerde) Name() PayloadEncoding {
	return PayloadEncodingProtobuf
}

func (d ProtobufSchemaSerde) DeserializePayload(record *kgo.Record, payloadType PayloadType) (RecordPayload, error) {
	if d.ProtoSvc == nil {
		return RecordPayload{}, fmt.Errorf("no protobuf file registry configured")
	}

	if !d.ProtoSvc.IsProtobufSchemaRegistryEnabled() {
		return RecordPayload{}, fmt.Errorf("protobuf schema registry disabled")
	}

	payload := payloadFromRecord(record, payloadType)

	if len(payload) <= 5 {
		return RecordPayload{}, fmt.Errorf("payload size is < 5")
	}

	if payload[0] != byte(0) {
		return RecordPayload{}, fmt.Errorf("incorrect magic byte for protobuf schema")
	}

	var srSerde sr.Serde
	schemaID, remainingData, err := srSerde.DecodeID(payload)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("decoding schema id: %w", err)
	}

	index, remainingData, err := srSerde.DecodeIndex(remainingData, 128)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("decoding protobuf index: %w", err)
	}

	fd, exists := d.ProtoSvc.GetFileDescriptorBySchemaID(schemaID)
	if !exists {
		return RecordPayload{}, fmt.Errorf("schema ID %+v not found", schemaID)
	}

	messageTypes := fd.GetMessageTypes()
	var messageDescriptor *desc.MessageDescriptor
	for _, idx := range index {
		if idx > len(messageTypes) {
			return RecordPayload{}, fmt.Errorf("failed to decode message type: message index is larger than the message types array length")
		}
		messageDescriptor = messageTypes[idx]
		messageTypes = messageDescriptor.GetNestedMessageTypes()
	}

	jsonBytes, err := d.ProtoSvc.DeserializeProtobufMessageToJSON(remainingData, messageDescriptor)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("failed to serialize protobuf to json: %w", err)
	}

	var native interface{}
	err = json.Unmarshal(jsonBytes, &native)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("failed to serialize protobuf payload into JSON: %w", err)
	}

	return RecordPayload{
		DeserializedPayload: native,
		NormalizedPayload:   jsonBytes,
		Encoding:            PayloadEncodingProtobuf,
	}, nil
}

func (d ProtobufSchemaSerde) SerializeObject(obj any, payloadType PayloadType, opts ...SerdeOpt) ([]byte, error) {
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
		if !so.schemaIDSet {
			return nil, errors.New("no schema id specified")
		}

		encoded, err := json.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize protobuf payload: %w", err)
		}

		b, err := d.ProtoSvc.SerializeJSONToConfluentProtobufMessage(encoded, int(so.schemaId), so.index)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize native protobuf payload: %w", err)
		}

		binData = b
	case string:
		if !so.schemaIDSet {
			return nil, errors.New("no schema id specified")
		}

		trimmed := strings.TrimLeft(v, " \t\r\n")

		if len(trimmed) == 0 {
			return nil, errors.New("string payload is empty")
		}

		startsWithJSON := trimmed[0] == '[' || trimmed[0] == '{'
		if !startsWithJSON {
			return nil, fmt.Errorf("first byte indicates this it not valid JSON, expected brackets")
		}

		b, err := d.ProtoSvc.SerializeJSONToConfluentProtobufMessage([]byte(trimmed), int(so.schemaId), so.index)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize string protobuf payload: %w", err)
		}

		binData = b
	case []byte:
		trimmed := bytes.TrimLeft(v, " \t\r\n")
		if len(trimmed) != 0 && trimmed[0] == '[' || trimmed[0] == '{' {
			if !so.schemaIDSet {
				return nil, errors.New("no schema id specified")
			}

			b, err := d.ProtoSvc.SerializeJSONToConfluentProtobufMessage(trimmed, int(so.schemaId), so.index)
			if err != nil {
				return nil, fmt.Errorf("failed to serialize json protobuf payload: %w", err)
			}
			binData = b
		} else {
			if !so.schemaIDSet {
				return nil, errors.New("no schema id specified")
			}

			index := so.index
			if len(index) == 0 {
				index = []int{0}
			}

			_, err := d.ProtoSvc.GetMessageDescriptorForSchema(int(so.schemaId), index)
			if err != nil {
				return nil, fmt.Errorf("failed to serialize binary protobuf payload: %w", err)
			}

			header, err := appendEncode(nil, int(so.schemaId), index)
			if err != nil {
				return nil, fmt.Errorf("failed encode binary protobuf payload: %w", err)
			}

			binData = append(header, v...)
		}
	default:
		return nil, fmt.Errorf("unsupported type %+T for protobuf serialization", obj)
	}

	return binData, nil
}
