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
	"github.com/jhump/protoreflect/dynamic"
	"github.com/twmb/franz-go/pkg/kgo"
	v2proto "google.golang.org/protobuf/proto"

	"github.com/redpanda-data/console/backend/pkg/proto"
)

var _ Serde = (*ProtobufSerde)(nil)

// ProtobufSerde represents the serde for dealing with Protobuf types.
type ProtobufSerde struct {
	ProtoSvc *proto.Service
}

// Name returns the name of the serde payload encoding.
func (ProtobufSerde) Name() PayloadEncoding {
	return PayloadEncodingProtobuf
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (d ProtobufSerde) DeserializePayload(_ context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	if d.ProtoSvc == nil {
		return &RecordPayload{}, errors.New("no protobuf file registry configured")
	}

	property := proto.RecordValue
	if payloadType == PayloadTypeKey {
		property = proto.RecordKey
	}

	messageDescriptor, err := d.ProtoSvc.GetMessageDescriptor(record.Topic, property)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to get message descriptor for payload: %w", err)
	}

	payload := payloadFromRecord(record, payloadType)

	msg := dynamic.NewMessage(messageDescriptor)
	err = msg.Unmarshal(payload)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to unmarshal payload into protobuf message: %w", err)
	}

	jsonBytes, err := d.ProtoSvc.DeserializeProtobufMessageToJSON(payload, messageDescriptor)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to serialize protobuf to json: %w", err)
	}

	var native any
	err = json.Unmarshal(jsonBytes, &native)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to serialize protobuf payload into JSON: %w", err)
	}

	return &RecordPayload{
		DeserializedPayload: native,
		NormalizedPayload:   jsonBytes,
		Encoding:            PayloadEncodingProtobuf,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
//
//nolint:gocognit,cyclop // lots of supported inputs.
func (d ProtobufSerde) SerializeObject(_ context.Context, obj any, payloadType PayloadType, opts ...SerdeOpt) ([]byte, error) {
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
		if so.topic == "" {
			return nil, errors.New("no topic specified")
		}

		encoded, err := json.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize protobuf payload: %w", err)
		}

		b, err := d.serializeJSON(encoded, payloadType, so.topic)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize dynamic protobuf payload: %w", err)
		}

		binData = b
	case string:
		if so.topic == "" {
			return nil, errors.New("no topic specified")
		}

		trimmed, startsWithJSON, err := trimJSONInputString(v)
		if err != nil {
			return nil, err
		}
		if !startsWithJSON {
			return nil, errors.New("first byte indicates this it not valid JSON, expected brackets")
		}

		b, err := d.serializeJSON([]byte(trimmed), payloadType, so.topic)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize string protobuf payload: %w", err)
		}

		binData = b
	case []byte:
		trimmed := bytes.TrimLeft(v, " \t\r\n")
		if len(trimmed) == 0 {
			return nil, errors.New("byte payload is empty")
		}

		if trimmed[0] == '[' || trimmed[0] == '{' {
			if so.topic == "" {
				return nil, errors.New("no topic specified")
			}

			b, err := d.serializeJSON(trimmed, payloadType, so.topic)
			if err != nil {
				return nil, fmt.Errorf("failed to serialize json protobuf payload: %w", err)
			}
			binData = b
		} else {
			binData = v
		}
	default:
		return nil, fmt.Errorf("unsupported type %+T for protobuf serialization", obj)
	}

	return binData, nil
}

func (d ProtobufSerde) serializeJSON(jsonBytes []byte, payloadType PayloadType, topic string) ([]byte, error) {
	property := proto.RecordValue
	if payloadType == PayloadTypeKey {
		property = proto.RecordKey
	}

	messageDescriptor, err := d.ProtoSvc.GetMessageDescriptor(topic, property)
	if err != nil {
		return nil, err
	}

	return d.ProtoSvc.SerializeJSONToProtobufMessage(jsonBytes, messageDescriptor)
}
