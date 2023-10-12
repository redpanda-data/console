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
	"encoding/binary"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/twmb/franz-go/pkg/kgo"
)

var _ Serde = (*UintSerde)(nil)

// UintSerde represents the serde for dealing with Uint numeric types.
type UintSerde struct{}

// Name returns the name of the serde payload encoding.
func (UintSerde) Name() PayloadEncoding {
	return PayloadEncodingUint
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (UintSerde) DeserializePayload(_ context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)

	payloadSize := len(payload)
	if payloadSize != 1 && payloadSize != 2 && payloadSize != 4 && payloadSize != 8 {
		return &RecordPayload{}, fmt.Errorf("payload is not of compatible size")
	}

	var err error
	var numericPayload []byte
	var numericObject interface{}
	switch len(payload) {
	case 8:
		var bev uint64
		buf := bytes.NewReader(payload)
		err = binary.Read(buf, binary.BigEndian, &bev)
		if err == nil {
			numericPayload = []byte(strconv.FormatUint(bev, 10))
			numericObject = bev
		}
	case 4:
		var bev uint32
		buf := bytes.NewReader(payload)
		err = binary.Read(buf, binary.BigEndian, &bev)
		if err == nil {
			numericPayload = []byte(strconv.FormatUint(uint64(bev), 10))
			numericObject = bev
		}
	case 2:
		var bev uint16
		buf := bytes.NewReader(payload)
		err = binary.Read(buf, binary.BigEndian, &bev)
		if err == nil {
			numericPayload = []byte(strconv.FormatUint(uint64(bev), 10))
			numericObject = bev
		}
	case 1:
		var bev uint8
		buf := bytes.NewReader(payload)
		err = binary.Read(buf, binary.BigEndian, &bev)
		if err == nil {
			numericPayload = []byte(strconv.FormatUint(uint64(bev), 10))
			numericObject = bev
		}
	}

	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to decode uint payload: %w", err)
	}

	return &RecordPayload{
		NormalizedPayload:   numericPayload,
		DeserializedPayload: numericObject,
		Encoding:            PayloadEncodingUint,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
func (UintSerde) SerializeObject(_ context.Context, obj any, _ PayloadType, opts ...SerdeOpt) ([]byte, error) {
	so := serdeCfg{}
	for _, o := range opts {
		o.apply(&so)
	}

	ss := Uint64
	if so.uintSizeSet {
		ss = so.uintSize
	}

	var byteData []byte
	switch v := obj.(type) {
	case uint8, uint16, uint32, uint64:
		buf := new(bytes.Buffer)
		binary.Write(buf, binary.BigEndian, v)
		byteData = buf.Bytes()
	case uint:
		buf := new(bytes.Buffer)
		binary.Write(buf, binary.BigEndian, uint64(v))
		byteData = buf.Bytes()
	case string:
		bv, err := convertStringToUint(v, ss)
		if err != nil {
			return nil, err
		}
		byteData = bv
	case []byte:
		bv, err := convertStringToUint(string(v), ss)
		if err != nil {
			return nil, err
		}
		byteData = bv
	default:
		return nil, fmt.Errorf("unsupported type %+T for uint serialization", obj)
	}

	return byteData, nil
}

func convertStringToUint(v string, ss UintSize) ([]byte, error) {
	var byteData []byte

	trimmed := strings.TrimLeft(v, " \t\r\n")
	if trimmed == "" {
		return nil, errors.New("string payload is empty")
	}

	switch ss {
	case Uint8:
		nv, err := strconv.ParseUint(v, 10, 8)
		if err != nil {
			return nil, fmt.Errorf("failed to encode uint payload: %w", err)
		}
		buf := new(bytes.Buffer)
		binary.Write(buf, binary.BigEndian, uint8(nv))
		byteData = buf.Bytes()
	case Uint16:
		nv, err := strconv.ParseUint(v, 10, 16)
		if err != nil {
			return nil, fmt.Errorf("failed to encode uint payload: %w", err)
		}
		buf := new(bytes.Buffer)
		binary.Write(buf, binary.BigEndian, uint16(nv))
		byteData = buf.Bytes()
	case Uint32:
		nv, err := strconv.ParseUint(v, 10, 32)
		if err != nil {
			return nil, fmt.Errorf("failed to encode uint payload: %w", err)
		}
		buf := new(bytes.Buffer)
		binary.Write(buf, binary.BigEndian, uint32(nv))
		byteData = buf.Bytes()
	default:
		nv, err := strconv.ParseUint(v, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("failed to encode uint payload: %w", err)
		}
		buf := new(bytes.Buffer)
		binary.Write(buf, binary.BigEndian, nv)
		byteData = buf.Bytes()
	}

	return byteData, nil
}
