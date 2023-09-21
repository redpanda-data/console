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
)

var _ Serde = (*NoneSerde)(nil)

// NoneSerde represents the serde for dealing with nil types.
type NoneSerde struct{}

// Name returns the name of the serde payload encoding.
func (NoneSerde) Name() PayloadEncoding {
	return PayloadEncodingNone
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (NoneSerde) DeserializePayload(record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)

	if len(payload) != 0 {
		return &RecordPayload{}, fmt.Errorf("payload is not empty as expected for none encoding")
	}

	return &RecordPayload{
		NormalizedPayload:   []byte("{}"),
		DeserializedPayload: payload,
		Encoding:            PayloadEncodingNone,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
func (NoneSerde) SerializeObject(obj any, _ PayloadType, _ ...SerdeOpt) ([]byte, error) {
	emptyData := []byte{}

	// TODO should we handle empty JSON for none?

	if obj == nil {
		return emptyData, nil
	}

	switch v := obj.(type) {
	case string:
		if v != "" && v != "{}" {
			return nil, fmt.Errorf("input not empty")
		}
	case []byte:
		if len(v) != 0 && string(v) != "{}" {
			return nil, fmt.Errorf("input not empty")
		}
	case map[string]interface{}:
		if len(v) != 0 {
			return nil, fmt.Errorf("input not empty")
		}
	default:
		return nil, fmt.Errorf("unsupported type %+T for serialization", obj)
	}

	return emptyData, nil
}
