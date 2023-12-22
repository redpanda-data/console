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

var _ Serde = (*BinarySerde)(nil)

// BinarySerde represents the serde for dealing with binary data.
type BinarySerde struct{}

// Name returns the name of the serde payload encoding.
func (BinarySerde) Name() PayloadEncoding {
	return PayloadEncodingBinary
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (BinarySerde) DeserializePayload(_ context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)

	return &RecordPayload{
		DeserializedPayload: payload,
		NormalizedPayload:   payload, // The frontend will render these bytes
		Encoding:            PayloadEncodingBinary,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
func (BinarySerde) SerializeObject(_ context.Context, obj any, _ PayloadType, _ ...SerdeOpt) ([]byte, error) {
	byteData, isByte := obj.([]byte)
	if !isByte {
		return nil, fmt.Errorf("unsupported type %+T for binary serialization", obj)
	}
	return byteData, nil
}
