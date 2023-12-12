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

var _ Serde = (*NullSerde)(nil)

// NullSerde represents the serde for dealing with nil types.
type NullSerde struct{}

// Name returns the name of the serde payload encoding.
func (NullSerde) Name() PayloadEncoding {
	return PayloadEncodingNull
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (NullSerde) DeserializePayload(_ context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)

	if payload != nil {
		return &RecordPayload{}, fmt.Errorf("payload is not null as expected for none encoding")
	}

	return &RecordPayload{
		Encoding: PayloadEncodingNull,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
func (NullSerde) SerializeObject(_ context.Context, _ any, _ PayloadType, _ ...SerdeOpt) ([]byte, error) {
	return nil, nil
}
