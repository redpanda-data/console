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
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jhump/protoreflect/desc"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"

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
		return RecordPayload{}, fmt.Errorf("incorrect magic byte")
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

func (ProtobufSchemaSerde) SerializeObject(obj any, payloadType PayloadType, opts ...SerdeOpt) ([]byte, error) {
	return nil, errors.New("not implemented")
}
