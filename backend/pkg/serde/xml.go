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
	"context"
	"encoding/json"
	"fmt"
	"strings"

	xj "github.com/basgys/goxml2json"
	"github.com/twmb/franz-go/pkg/kgo"
)

var _ Serde = (*XMLSerde)(nil)

// XMLSerde represents the serde for dealing with XML encoded types.
type XMLSerde struct{}

// Name returns the name of the serde payload encoding.
func (XMLSerde) Name() PayloadEncoding {
	return PayloadEncodingXML
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (XMLSerde) DeserializePayload(_ context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)
	trimmed := bytes.TrimLeft(payload, " \t\r\n")

	if len(trimmed) == 0 {
		return &RecordPayload{}, fmt.Errorf("after trimming whitespaces there were no characters left")
	}

	startsWithXML := trimmed[0] == '<'
	if !startsWithXML {
		return &RecordPayload{}, fmt.Errorf("first byte indicates this it not valid XML")
	}

	r := strings.NewReader(string(trimmed))
	jsonPayload, err := xj.Convert(r)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("error converting XML to JSON: %w", err)
	}

	var obj any
	err = json.Unmarshal(jsonPayload.Bytes(), &obj)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to parse JSON payload: %w", err)
	}

	return &RecordPayload{
		NormalizedPayload:   jsonPayload.Bytes(),
		DeserializedPayload: obj,
		Encoding:            PayloadEncodingXML,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
func (XMLSerde) SerializeObject(_ context.Context, obj any, _ PayloadType, opts ...SerdeOpt) ([]byte, error) {
	so := serdeCfg{}
	for _, o := range opts {
		o.apply(&so)
	}

	var byteData []byte
	switch v := obj.(type) {
	case string:
		byteData = []byte(v)
	case []byte:
		byteData = v
	default:
		return nil, fmt.Errorf("unsupported type %+T for XML serialization", obj)
	}

	trimmed := bytes.TrimLeft(byteData, " \t\r\n")

	if len(trimmed) == 0 {
		return nil, fmt.Errorf("after trimming whitespaces there were no characters left")
	}

	startsWithXML := trimmed[0] == '<'
	if !startsWithXML {
		return nil, fmt.Errorf("first byte indicates this it not valid XML")
	}

	return trimmed, nil
}
