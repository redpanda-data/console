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

type NoneSerde struct{}

func (NoneSerde) Name() PayloadEncoding {
	return PayloadEncodingNone
}

func (NoneSerde) DeserializePayload(record *kgo.Record, payloadType PayloadType) (RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)

	if len(payload) != 0 {
		return RecordPayload{}, fmt.Errorf("payload is not empty as expected for none encoding")
	}

	return RecordPayload{
		NormalizedPayload:   []byte("{}"),
		DeserializedPayload: payload,
		Encoding:            PayloadEncodingNone,
	}, nil
}

func (NoneSerde) SerializeObject(obj any, payloadType PayloadType, opts ...SerdeOpt) ([]byte, error) {
	emptyData := []byte{}

	// TODO should we handle empty JSON for none?

	switch v := obj.(type) {
	case string:
		if len(v) != 0 && v != "{}" {
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
		return nil, fmt.Errorf("unsupported type %+T for protobuf serialization", obj)
	}

	return emptyData, nil
}
