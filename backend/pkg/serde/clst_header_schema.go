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
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"
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

	schemaInfo, err := getSchemaInfoFromHeaders(record)
	if err != nil {
		fmt.Println("Error extracting schema info:", err)
		return nil, fmt.Errorf("failed to extract schema info from headers: %w", err)
	}
	fmt.Printf("Key: %s and Value: %v\n", schemaInfo.ProtobufTypeKey, schemaInfo.ProtobufTypeValue)

	// Buf schema example: https://clst.buf.team/fleet/bk/docs/main:apollo.bk.v1#apollo.bk.v1.Transaction

	// fd, exists := headerSchemaSerde.ProtoSvc.GetFileDescriptorBySchemaID(schemaInfo.ProtobufTypeValue)
	// if !exists {
	// 	return &RecordPayload{}, fmt.Errorf("schema ID %+v not found", schemaID)
	// }

	// Now handle the record value payload
	// msgPayload := payloadFromRecord(record, payloadType)
	// var jsonData map[string]interface{}
	// if err := json.Unmarshal(msgPayload, &jsonData); err != nil {
	// 	fmt.Println("Error deserializing JSON payload:", err)
	// 	return nil, fmt.Errorf("failed to deserialize JSON payload: %w", err)
	// }

	// fmt.Println("Successfully deserialized JSON payload")
	// return &RecordPayload{
	// 	DeserializedPayload: jsonData,
	// 	NormalizedPayload:   msgPayload,
	// 	Encoding:            PayloadEncoding("header-schema"),
	// }, nil
	// return &RecordPayload{}, fmt.Errorf("CLST Deserializer	not implemented")
	return &RecordPayload{
		DeserializedPayload: schemaInfo,
		NormalizedPayload:   nil,
		Encoding:            PayloadEncodingCLSTHeaderSchema,
		SchemaID:            nil,
	}, nil
}
