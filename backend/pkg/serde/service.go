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

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/msgpack"
	"github.com/redpanda-data/console/backend/pkg/proto"
	"github.com/redpanda-data/console/backend/pkg/schema"
)

// Service is the struct that holds all dependencies that are required to deserialize
// a record.
type Service struct {
	SerDes []Serde
}

// NewService creates the new serde service.
func NewService(schemaService *schema.Service, protoSvc *proto.Service, msgPackSvc *msgpack.Service) *Service {
	return &Service{
		SerDes: []Serde{
			NoneSerde{},
			JSONSerde{},
			JSONSchemaSerde{SchemaSvc: schemaService},
			XMLSerde{},
			AvroSerde{SchemaSvc: schemaService},
			ProtobufSerde{ProtoSvc: protoSvc},
			ProtobufSchemaSerde{ProtoSvc: protoSvc},
			MsgPackSerde{MsgPackService: msgPackSvc},
			SmileSerde{},
			UTF8Serde{},
			TextSerde{},
			UintSerde{},
			BinarySerde{},
		},
	}
}

// DeserializeRecord tries to deserialize a Kafka record into a struct that
// can be processed by the Frontend.
func (s *Service) DeserializeRecord(ctx context.Context, record *kgo.Record, opts DeserializationOptions) *Record {
	// defaults
	if opts.MaxPayloadSize <= 0 {
		opts.MaxPayloadSize = config.DefaultMaxDeserializationPayloadSize
	}

	// 1. Test if it's a known binary Format
	if record.Topic == "__consumer_offsets" {
		rec, err := s.deserializeConsumerOffset(record)
		if err == nil {
			return rec
		}
	}

	// 2. Deserialize key & value separately
	key := s.deserializePayload(ctx, record, PayloadTypeKey, &opts)
	val := s.deserializePayload(ctx, record, PayloadTypeValue, &opts)
	headers := recordHeaders(record)

	return &Record{
		Key:     key,
		Value:   val,
		Headers: headers,
	}
}

// deserializePayload deserializes either the key or value of a Kafka record by trying
// the pre-defined deserialization strategies.
func (s *Service) deserializePayload(ctx context.Context, record *kgo.Record, payloadType PayloadType, opts *DeserializationOptions) *RecordPayload {
	payload := payloadFromRecord(record, payloadType)

	var originalPayload []byte
	if opts.IncludeRawData {
		originalPayload = payload
	}
	// Check if payload is empty
	if len(payload) == 0 {
		return &RecordPayload{
			OriginalPayload:  originalPayload,
			IsPayloadNull:    payload == nil,
			PayloadSizeBytes: 0,
			Encoding:         PayloadEncodingNone,
		}
	}

	troubleshooting := make([]TroubleshootingReport, 0, len(s.SerDes))

	serdeEncoding := opts.KeyEncoding
	if payloadType == PayloadTypeValue {
		serdeEncoding = opts.ValueEncoding
	}

	doCustomEncoding := serdeEncoding != PayloadEncodingUnspecified && serdeEncoding != ""

	// Try all registered SerDes in the order they were registered
	var rp *RecordPayload
	var err error
	for _, serde := range s.SerDes {
		if doCustomEncoding {
			if serdeEncoding != serde.Name() {
				continue
			}
		}

		rp, err = serde.DeserializePayload(ctx, record, payloadType)
		if err == nil {
			// found the matching serde
			break
		}

		troubleshooting = append(troubleshooting, TroubleshootingReport{
			SerdeName: string(serde.Name()),
			Message:   err.Error(),
		})
	}

	rp.PayloadSizeBytes = len(payload)
	rp.IsPayloadNull = payload == nil

	if opts.IncludeRawData {
		rp.OriginalPayload = payload
	}

	if len(payload) > opts.MaxPayloadSize {
		rp.IsPayloadTooLarge = true
		rp.NormalizedPayload = nil
	}

	if opts.Troubleshoot || rp.Encoding == PayloadEncodingBinary {
		rp.Troubleshooting = troubleshooting
	}

	return rp
}

// DeserializationOptions that can be provided by the requester to influence
// the deserialization.
type DeserializationOptions struct {
	// KeyEncoding may be specified by the frontend to indicate that this
	// encoding type shall be used to deserialize the key. This is helpful,
	// if the requester knows that a primitive type like int16 is used, which couldn't
	// be guessed automatically. No other encoding method will be tried if this
	// method has failed. Troubleshoot should always be set to true in this case.
	KeyEncoding PayloadEncoding

	// PreferredValueEncoding may be specified by the frontend to indicate that this
	// encoding type shall be used to deserialize the value. This is helpful,
	// if the requester knows that a primitive type like int16 is used, which couldn't
	// be guessed automatically. No other encoding method will be tried if this
	// method has failed. Troubleshoot should always be set to true in this case.
	ValueEncoding PayloadEncoding

	// MaxPayloadSize is the maximum size of the payload.
	MaxPayloadSize int

	// Troubleshoot can be enabled to return additional information which reports
	// why each performed deserialization strategy has failed. If the first
	// tested encoding method worked successfully no troubleshooting information
	// is returned.
	Troubleshoot bool

	// IncludeRawData can be enabled to include raw binary data in the returned output.
	IncludeRawData bool
}

// SerializeRecord will serialize the input.
func (s *Service) SerializeRecord(ctx context.Context, input SerializeInput) (*SerializeOutput, error) {
	keySerResult := RecordPayloadSerializeResult{}
	valueSerResult := RecordPayloadSerializeResult{}

	sr := SerializeOutput{}
	sr.Key = &keySerResult
	sr.Value = &valueSerResult

	// key
	if input.Topic != "" {
		input.Key.Options = append(input.Key.Options, WithTopic(input.Topic))
	}

	keyTS := make([]TroubleshootingReport, 0)
	found := false
	var err error
	var bytes []byte
	for _, serde := range s.SerDes {
		if input.Key.Encoding != serde.Name() {
			continue
		}

		found = true
		bytes, err = serde.SerializeObject(ctx, input.Key.Payload, PayloadTypeKey, input.Key.Options...)
		if err != nil {
			keyTS = append(keyTS, TroubleshootingReport{
				SerdeName: string(serde.Name()),
				Message:   err.Error(),
			})
		} else {
			keySerResult.Encoding = serde.Name()
			keySerResult.Payload = bytes
		}

		break
	}

	keySerResult.Troubleshooting = keyTS

	if !found {
		err = fmt.Errorf("invalid encoding for key: %s", input.Key.Encoding)
	}

	if err != nil {
		return &sr, err
	}

	// value
	if input.Topic != "" {
		input.Value.Options = append(input.Value.Options, WithTopic(input.Topic))
	}

	valueTS := make([]TroubleshootingReport, 0)
	found = false
	err = nil
	for _, serde := range s.SerDes {
		if input.Value.Encoding != serde.Name() {
			continue
		}

		found = true
		bytes, err = serde.SerializeObject(ctx, input.Value.Payload, PayloadTypeValue, input.Value.Options...)
		if err != nil {
			valueTS = append(valueTS, TroubleshootingReport{
				SerdeName: string(serde.Name()),
				Message:   err.Error(),
			})
		} else {
			valueSerResult.Encoding = serde.Name()
			valueSerResult.Payload = bytes
		}

		break
	}

	valueSerResult.Troubleshooting = valueTS

	if !found {
		err = fmt.Errorf("invalid encoding for value: %s", input.Value.Encoding)
	}

	return &sr, err
}

func payloadFromRecord(record *kgo.Record, payloadType PayloadType) []byte {
	if payloadType == PayloadTypeValue {
		return record.Value
	}
	return record.Key
}
