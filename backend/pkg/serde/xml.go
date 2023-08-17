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
	"bytes"
	"encoding/json"
	"fmt"
	"strings"

	xj "github.com/basgys/goxml2json"
	"github.com/twmb/franz-go/pkg/kgo"
)

var _ Serde = (*XMLSerde)(nil)

type XMLSerde struct{}

func (XMLSerde) Name() PayloadEncoding {
	return PayloadEncodingXML
}

func (XMLSerde) DeserializePayload(record *kgo.Record, payloadType PayloadType) (RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)
	trimmed := bytes.TrimLeft(payload, " \t\r\n")

	if len(trimmed) == 0 {
		return RecordPayload{}, fmt.Errorf("after trimming whitespaces there was no character left")
	}

	startsWithXML := trimmed[0] == '<'
	if !startsWithXML {
		return RecordPayload{}, fmt.Errorf("first byte indicates this it not valid XML")
	}

	r := strings.NewReader(string(trimmed))
	jsonPayload, err := xj.Convert(r)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("error converting XML to JSON: %w", err)
	}

	var obj any
	err = json.Unmarshal(jsonPayload.Bytes(), &obj)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("failed to parse JSON payload: %w", err)
	}

	return RecordPayload{
		NormalizedPayload:   jsonPayload.Bytes(),
		DeserializedPayload: obj,
		Encoding:            PayloadEncodingXML,
	}, nil
}
