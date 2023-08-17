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

var _ Serde = (*JsonSchemaSerde)(nil)

type JsonSchemaSerde struct{}

func (JsonSchemaSerde) Name() PayloadEncoding {
	return PayloadEncodingJSON
}

func (JsonSchemaSerde) DeserializePayload(record *kgo.Record, payloadType PayloadType) (RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)

	if len(payload) <= 5 {
		return RecordPayload{}, fmt.Errorf("payload size is < 5 for json schema")
	}

	if payload[0] != byte(0) {
		return RecordPayload{}, fmt.Errorf("incorrect magic byte for json schema")
	}

	// TODO: For more confidence we could just ask the schema service for the given
	// schema and based on the response we can check the schema type (avro, json, ..)

	return jsonDeserializePayload(payload[5:])
}
