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
	"encoding/json"
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/dynamicpb"
)

// Compile-time check to ensure CLSTHeaderSchemaSerde implements Serde
var _ Serde = (*CLSTHeaderSchemaSerde)(nil)

type CLSTHeaderSchemaSerde struct{}

// SerializeObject implements Serde.
func (d CLSTHeaderSchemaSerde) SerializeObject(ctx context.Context, obj any, payloadType PayloadType, opts ...SerdeOpt) ([]byte, error) {
	return nil, fmt.Errorf("CLST Serialize Not implemented")
}

func (CLSTHeaderSchemaSerde) Name() PayloadEncoding {
	return PayloadEncodingCLSTHeaderSchema
}

// DeserializePayload maps relevant headers into SchemaInfo
func (headerSchemaSerde CLSTHeaderSchemaSerde) DeserializePayload(ctx context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {

	// fmt.Printf("Record Value: %+v \n\n Record Key: %s\n\n", string(record.Value), string(record.Key))
	schemaInfo, err := getSchemaInfoFromHeaders(record)
	if err != nil {
		fmt.Println("Error extracting schema info:", err)
		return nil, fmt.Errorf("failed to extract schema info from headers: %w", err)
	}

	var fullName string
	if payloadForValue(payloadType) {
		fullName = schemaInfo.ProtobufTypeValue
	} else {
		fullName = schemaInfo.ProtobufTypeKey
	}

	// fmt.Printf("SchemaInfro: %+v \n\n FullName: %s\n\n", schemaInfo, fullName)

	module := getModule(fullName)
	symbols := []string{fullName}
	messageDescriptor, err := getMessageDescriptor(module, "main", symbols, fullName)
	if err != nil {
		return nil, fmt.Errorf("failed to get file descriptor set: %w", err)
	}
	// fmt.Printf("MessageDescriptor: %v\n\n", messageDescriptor)

	payload := payloadFromRecord(record, payloadType)

	// fmt.Printf("Payload: %v\n\n", payload)
	dynamicMsg := dynamicpb.NewMessage(messageDescriptor)

	if err := proto.Unmarshal(payload, dynamicMsg); err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to unmarshal record data: %w", err)
	}
	// fmt.Printf("DynamicMsg: %v\n\n", dynamicMsg)
	fixAnyFields(dynamicMsg)

	// fmt.Printf("DynamicMsg After Fixed: %v\n\n", dynamicMsg)

	jsonBytes, err := protojson.Marshal(dynamicMsg)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to marshal dynamic Message: %w", err)
	}

	var native interface{}
	if err := json.Unmarshal(jsonBytes, &native); err != nil {
		return nil, fmt.Errorf("json.Unmarshal dynamic message: %w", err)
	}

	result := &RecordPayload{
		DeserializedPayload: native,    // structured
		NormalizedPayload:   jsonBytes, // raw JSON
		Encoding:            PayloadEncodingProtobuf,
		SchemaID:            nil,
	}

	return result, nil
}
