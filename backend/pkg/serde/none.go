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
	return payloadEncodingNone
}

func (NoneSerde) DeserializePayload(record *kgo.Record, payloadType payloadType) (RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)

	if len(payload) != 0 {
		return RecordPayload{}, fmt.Errorf("payload is not empty as expected for none encoding")
	}

	return RecordPayload{
		ParsedPayload: payload,
		Encoding:      payloadEncodingNone,
	}, nil
}
