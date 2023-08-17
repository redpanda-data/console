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
	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/redpanda-data/console/backend/pkg/msgpack"
	"github.com/redpanda-data/console/backend/pkg/proto"
	"github.com/redpanda-data/console/backend/pkg/schema"
)

// Service is the struct that holds all dependencies that are required to deserialize
// a record.
type Service struct {
	SerDes []Serde
}

func NewService(schemaService *schema.Service, protoSvc *proto.Service, msgPackSvc *msgpack.Service) *Service {
	return &Service{
		SerDes: []Serde{
			NoneSerde{},
			JsonSerde{},
			JsonSchemaSerde{},
			XMLSerde{},
			AvroSerde{SchemaSvc: schemaService},
			ProtobufSerde{ProtoSvc: protoSvc},
			ProtobufSchemaSerde{ProtoSvc: protoSvc},
			MsgPackSerde{MsgPackService: msgPackSvc},
			SmileSerde{},
			UTF8Serde{},
			TextSerde{},
		},
	}
}

// DeserializeRecord tries to deserialize a Kafka record into a struct that
// can be processed by the Frontend.
func (s *Service) DeserializeRecord(record *kgo.Record, opts DeserializationOptions) *Record {
	// 1. Test if it's a known binary Format
	if record.Topic == "__consumer_offsets" {
		rec, err := s.deserializeConsumerOffset(record)
		if err == nil {
			return rec
		}
	}

	// 2. Deserialize key & value separately
	key := s.deserializePayload(record, payloadTypeKey)
	val := s.deserializePayload(record, payloadTypeValue)
	headers := recordHeaders(record)

	return &Record{
		Key:     key,
		Value:   val,
		Headers: headers,
	}
}

// deserializePayload deserializes either the key or value of a Kafka record by trying
// the pre-defined deserialization strategies.
func (s *Service) deserializePayload(record *kgo.Record, payloadType PayloadType) RecordPayload {
	payload := payloadFromRecord(record, payloadType)

	// Check if payload is empty
	if len(payload) == 0 {
		return RecordPayload{
			OriginalPayload:  payload,
			IsPayloadNull:    payload == nil,
			PayloadSizeBytes: 0,
			Encoding:         PayloadEncodingNone,
		}
	}

	troubleshooting := make([]TroubleshootingReport, 0)

	// Try all registered SerDes in the order they were registered
	for _, serde := range s.SerDes {
		rp, err := serde.DeserializePayload(record, payloadType)
		if err != nil {
			troubleshooting = append(troubleshooting, TroubleshootingReport{
				SerdeName: string(serde.Name()),
				Message:   err.Error(),
			})
		} else {
			// Serde deserialized successfully, let's add fields that always shall
			// be set, regardless of the SerDe used.
			rp.OriginalPayload = payload // TODO: Set to nil if too large or not requested
			rp.PayloadSizeBytes = len(payload)
			rp.IsPayloadNull = payload == nil
			rp.IsPayloadTooLarge = false         // TODO: Set to true if too large
			rp.Troubleshooting = troubleshooting // TODO: Only if troubleshooting is enabled in request opts
			return rp
		}
	}

	// Anything else is considered binary
	return RecordPayload{
		OriginalPayload:   payload, // TODO: Set to nil if too large or not requested
		PayloadSizeBytes:  len(payload),
		IsPayloadNull:     payload == nil,
		IsPayloadTooLarge: false,           // TODO: Set to true if too large
		Troubleshooting:   troubleshooting, // TODO: Only if troubleshooting is enabled in request opts
		Encoding:          PayloadEncodingBinary,
	}
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

	// Troubleshoot can be enabled to return additional information which reports
	// why each performed deserialization strategy has failed. If the first
	// tested encoding method worked successfully no troubleshooting information
	// is returned.
	Troubleshoot bool
}

func payloadFromRecord(record *kgo.Record, payloadType PayloadType) []byte {
	if payloadType == payloadTypeValue {
		return record.Value
	}
	return record.Key
}
