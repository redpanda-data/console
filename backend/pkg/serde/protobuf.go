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
	"fmt"

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

	jsonBytes, err := d.ProtoSvc.DeserializeProtobufMessageToJSON(payload, messageDescriptor)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("failed to serialize protobuf to json: %w", err)
	}

	return RecordPayload{
		ParsedPayload: jsonBytes,
		Encoding:      PayloadEncodingProtobuf,
	}, nil
}
