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
	"fmt"

	"github.com/jhump/protoreflect/dynamic"
	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/redpanda-data/console/backend/pkg/proto"
)

var _ Serde = (*ProtobufSerde)(nil)

type ProtobufSerde struct {
	ProtoSvc *proto.Service
}

func (ProtobufSerde) Name() PayloadEncoding {
	return PayloadEncodingProtobuf
}

func (d ProtobufSerde) DeserializePayload(record *kgo.Record, payloadType PayloadType) (RecordPayload, error) {
	if d.ProtoSvc == nil {
		return RecordPayload{}, fmt.Errorf("no protobuf file registry configured")
	}

	property := proto.RecordValue
	if payloadType == payloadTypeKey {
		property = proto.RecordKey
	}

	messageDescriptor, err := d.ProtoSvc.GetMessageDescriptor(record.Topic, property)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("failed to get message descriptor for payload: %w", err)
	}

	payload := payloadFromRecord(record, payloadType)

	msg := dynamic.NewMessage(messageDescriptor)
	err = msg.Unmarshal(payload)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("failed to unmarshal payload into protobuf message: %w", err)
	}

	jsonBytes, err := d.ProtoSvc.DeserializeProtobufMessageToJSON(payload, messageDescriptor)
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
