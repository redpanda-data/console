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
	fmt.Println("CLSTHeaderSchemaSerde Starting DeserializePayload...")
	return &RecordPayload{}, fmt.Errorf("CLST Deserializer	not implemented")
}
