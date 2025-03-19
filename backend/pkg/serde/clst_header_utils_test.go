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
	"os"
	"testing"

	"github.com/twmb/franz-go/pkg/kgo"
)

var rawProtoBKEvent = []byte{
	10, 12, 84, 114, 97, 100, 101, 67, 114, 101, 97, 116, 101, 100, 18, 13,
	98, 107, 116, 120, 112, 114, 111, 99, 101, 115, 115, 111, 114, 24, 254, 128, 169, 175, 217, 50,
	34, 32, 53, 48, 51, 49, 51, 45, 97, 51, 48, 50, 50, 101, 99, 57, 50, 98, 57, 102, 102,
	52, 54, 48, 49, 56, 55, 101, 49, 99, 49, 57, 57, 99, 162, 6, 212, 4, 10, 50, 116, 121,
	112, 101, 46, 99, 108, 101, 97, 114, 115, 116, 114, 101, 101, 116, 46, 105, 111, 47, 97, 112,
	111, 108, 108, 111, 46, 98, 107, 46, 118, 49, 46, 84, 114, 97, 100, 101, 67, 114, 101, 97,
	116, 101, 100, 69, 118, 101, 110, 116, 18, 157, 4, 10, 207, 3, 8, 248, 255, 168, 175, 217,
	50, 18, 32, 53, 48, 51, 49, 51, 45, 97, 51, 48, 50, 50, 101, 99, 57, 50, 98, 57, 102,
	102, 52, 54, 48, 49, 56, 55, 101, 49, 99, 49, 57, 57, 99, 24, 3, 34, 18, 50, 48, 49,
	50, 53, 48, 51, 49, 52, 48, 48, 48, 53, 52, 57, 57, 53, 57, 42, 34, 99, 98, 54, 48,
	98, 56, 48, 56, 45, 54, 55, 100, 51, 100, 57, 101, 49, 48, 48, 48, 50, 99, 97, 99, 53,
	45, 50, 53, 45, 56, 57, 99, 57, 100, 56, 144, 199, 168, 175, 217, 50, 64, 202, 253, 211,
	9, 72, 205, 253, 211, 9, 80, 180, 165, 6, 96, 237, 101, 104, 5, 114, 5, 56, 53, 46,
	55, 54, 122, 1, 49, 128, 1, 1, 136, 1, 2, 162, 1, 5, 56, 53, 46, 55, 54, 170, 1,
	5, 56, 53, 46, 55, 54, 176, 1, 182, 164, 6, 186, 1, 1, 48, 194, 1, 1, 48, 202, 1,
	1, 48, 210, 1, 1, 48, 218, 1, 1, 48, 226, 1, 1, 48, 234, 1, 1, 48, 240, 1, 2, 248,
	1, 6, 146, 2, 4, 73, 78, 67, 65, 154, 2, 2, 54, 55, 162, 2, 4, 69, 84, 66, 69, 170,
	2, 4, 88, 78, 65, 83, 232, 2, 184, 1, 240, 2, 1, 250, 2, 11, 68, 84, 67, 89, 85,
	83, 51, 51, 88, 88, 88, 128, 3, 5, 210, 3, 173, 1, 10, 74, 10, 4, 104, 97, 115, 104,
	18, 66, 26, 64, 52, 54, 101, 101, 50, 57, 55, 51, 54, 56, 50, 48, 97, 52, 102, 98,
	52, 48, 102, 52, 52, 48, 50, 102, 52, 102, 100, 48, 100, 49, 97, 50, 54, 102, 50, 100,
	53, 99, 52, 50, 54, 52, 48, 102, 51, 56, 101, 102, 100, 100, 98, 52, 55, 99, 100, 53,
	97, 48, 101, 100, 99, 53, 49, 50, 10, 95, 10, 16, 112, 97, 114, 116, 105, 116, 105,
	111, 110, 95, 98, 117, 99, 107, 101, 116, 18, 75, 26, 73, 116, 114, 97, 100, 101, 95,
	105, 100, 61, 101, 99, 53, 52, 51, 56, 50, 51, 102, 54, 101, 55, 99, 49, 99, 98, 101,
	55, 53, 50, 98, 49, 55, 53, 48, 98, 56, 56, 98, 97, 102, 56, 98, 55, 53, 53, 52, 97,
	51, 100, 102, 52, 57, 50, 49, 53, 102, 48, 53, 51, 100, 55, 55, 57, 53, 57, 52, 102,
	55, 100, 57, 50, 54, 102, 138, 4, 15, 8, 1, 18, 4, 48, 46, 48, 50, 24, 5, 34, 3,
	85, 83, 65, 138, 4, 15, 8, 2, 18, 4, 48, 46, 48, 56, 24, 5, 34, 3, 85, 83, 65, 26,
	73, 50, 48, 50, 53, 48, 51, 49, 52, 45, 100, 56, 97, 48, 100, 53, 97, 51, 56, 57, 56,
	102, 101, 100, 48, 49, 57, 49, 48, 50, 56, 54, 100, 53, 51, 52, 50, 51, 99, 99, 100,
	52, 49, 50, 52, 54, 102, 55, 57, 57, 51, 99, 52, 48, 55, 52, 51, 102, 57, 49, 102,
	97, 55, 52, 54, 99, 98, 56, 50, 52, 50, 57, 54, 56,
}

var rawProtoBKTransactionKey = []byte{
	10, 12, 84, 114, 97, 100, 101, 67, 114, 101, 97, 116, 101, 100, 18, 13,
	98, 107, 116, 120, 112, 114, 111, 99, 101, 115, 115, 111, 114, 24, 230, 191,
	165, 134, 217, 50, 34, 32, 53, 48, 51, 49, 51, 45, 48, 98, 100, 54, 50, 99,
	54, 98, 50, 53, 51, 53, 52, 48, 53, 57, 53, 97, 56, 57, 100, 51, 57, 98, 97,
	102, 162, 6, 164, 4, 10, 50, 116, 121, 112, 101, 46, 99, 108, 101, 97, 114,
	115, 116, 114, 101, 101, 116, 46, 105, 111, 47, 97, 112, 111, 108, 108, 111,
	46, 98, 107, 46, 118, 49, 46, 84, 114, 97, 100, 101, 67, 114, 101, 97, 116,
	101, 100, 69, 118, 101, 110, 116, 18, 237, 3, 10, 159, 3, 8, 141, 190, 165,
	134, 217, 50, 18, 32, 53, 48, 51, 49, 51, 45, 48, 98, 100, 54, 50, 99, 54, 98,
	50, 53, 51, 53, 52, 48, 53, 57, 53, 97, 56, 57, 100, 51, 57, 98, 97, 102, 24,
	3, 34, 6, 54, 50, 52, 50, 48, 53, 42, 34, 99, 98, 54, 48, 98, 56, 48, 56, 45,
	54, 55, 100, 50, 56, 56, 54, 49, 48, 48, 48, 50, 53, 50, 51, 48, 45, 50, 53,
	45, 98, 97, 55, 48, 48, 56, 150, 132, 165, 134, 217, 50, 64, 201, 253, 211, 9,
	72, 202, 253, 211, 9, 80, 180, 165, 6, 96, 237, 101, 104, 5, 114, 5, 56, 53,
	46, 55, 54, 122, 1, 49, 128, 1, 1, 136, 1, 2, 162, 1, 5, 56, 53, 46, 55, 54,
	170, 1, 5, 56, 53, 46, 55, 54, 176, 1, 182, 164, 6, 186, 1, 1, 48, 194, 1, 1,
	48, 202, 1, 1, 48, 210, 1, 1, 48, 218, 1, 1, 48, 226, 1, 1, 48, 234, 1, 1, 48,
	240, 1, 2, 248, 1, 6, 146, 2, 4, 73, 78, 67, 65, 154, 2, 2, 54, 55, 162, 2, 4,
	69, 84, 66, 69, 170, 2, 4, 88, 78, 65, 83, 232, 2, 184, 1, 240, 2, 1, 250, 2, 11,
	68, 84, 67, 89, 85, 83, 51, 51, 88, 88, 88, 128, 3, 5, 210, 3, 173, 1, 10, 74, 10,
	4, 104, 97, 115, 104, 18, 66, 26, 64, 50, 53, 52, 101, 101, 99, 100, 97, 52, 52,
	53, 56, 50, 51, 54, 52, 56, 100, 101, 98, 97, 55, 101, 100, 101, 54, 99, 50, 98,
	49, 53, 50, 52, 55, 100, 52, 98, 97, 99, 51, 48, 50, 100, 52, 53, 102, 57, 57, 102,
	49, 53, 54, 102, 54, 49, 53, 53, 48, 51, 57, 50, 50, 100, 99, 10, 95, 10, 16, 112,
	97, 114, 116, 105, 116, 105, 111, 110, 95, 98, 117, 99, 107, 101, 116, 18, 75, 26,
	73, 116, 114, 97, 100, 101, 95, 105, 100, 61, 102, 52, 102, 50, 99, 97, 50, 98, 99,
	56, 52, 98, 54, 97, 102, 51, 97, 56, 57, 97, 57, 100, 101, 97, 56, 54, 102, 101, 52,
	53, 49, 50, 102, 50, 48, 98, 48, 54, 48, 51, 50, 101, 49, 52, 97, 54, 57, 57, 99,
	54, 101, 100, 98, 51, 56, 100, 100, 52, 57, 51, 57, 54, 55, 56, 234, 3, 1, 82, 26,
	73, 50, 48, 50, 53, 48, 51, 49, 51, 45, 100, 55, 57, 99, 99, 98, 97, 51, 98, 48, 54,
	50, 48, 48, 57, 99, 48, 56, 57, 55, 101, 50, 53, 56, 97, 56, 97, 55, 49, 54, 98, 51,
	50, 98, 101, 49, 53, 56, 56, 52, 100, 55, 48, 54, 101, 55, 99, 55, 97, 101, 100, 101,
	98, 99, 55, 56, 55, 55, 49, 51, 54, 98, 55, 50,
}

var rawProtoLunaSessionCordEvents = []byte{
	10, 36, 55, 101, 51, 48, 55, 48, 54, 55, 45, 56, 51, 52, 100, 45, 52, 55, 56, 49, 45,
	57, 49, 55, 101, 45, 57, 101, 56, 53, 51, 99, 99, 54, 54, 98, 56, 54, 16, 206, 253, 211,
	9, 24, 248, 134, 7, 32, 1, 42, 4, 8, 242, 199, 38, 48, 220, 201, 168, 225, 218, 50, 56,
	2, 66, 251, 2, 10, 177, 1, 8, 202, 254, 2, 18, 170, 1, 8, 202, 254, 2, 16, 1, 34, 1, 49,
	42, 3, 85, 83, 68, 50, 4, 88, 78, 65, 83, 58, 5, 78, 82, 88, 80, 87, 66, 23, 78, 82, 88,
	32, 80, 104, 97, 114, 109, 97, 99, 101, 117, 116, 105, 99, 97, 108, 115, 32, 73, 110,
	99, 74, 6, 69, 113, 117, 105, 116, 121, 82, 7, 87, 97, 114, 114, 97, 110, 116, 88, 1,
	96, 1, 114, 11, 10, 9, 54, 50, 57, 52, 52, 52, 49, 49, 56, 122, 14, 10, 12, 85, 83, 54,
	50, 57, 52, 52, 52, 49, 49, 56, 50, 130, 1, 9, 10, 7, 66, 76, 54, 74, 53, 82, 57, 138,
	1, 14, 10, 12, 66, 66, 71, 48, 48, 74, 67, 87, 68, 75, 86, 49, 146, 1, 0, 154, 1, 7, 10,
	5, 78, 82, 88, 80, 87, 178, 1, 5, 10, 3, 85, 83, 65, 186, 1, 8, 53, 53, 53, 50, 50, 51,
	56, 55, 194, 1, 4, 8, 242, 199, 38, 18, 83, 8, 202, 254, 2, 18, 77, 8, 202, 254, 2, 16,
	219, 158, 146, 224, 218, 50, 26, 8, 48, 46, 48, 57, 51, 56, 48, 48, 42, 14, 10, 8, 50,
	46, 50, 48, 48, 48, 48, 48, 16, 242, 199, 38, 64, 206, 253, 211, 9, 82, 27, 80, 82, 73,
	67, 73, 78, 71, 95, 83, 79, 85, 82, 67, 69, 95, 84, 89, 80, 69, 95, 73, 78, 86, 65, 76,
	73, 68, 138, 1, 3, 85, 83, 68, 26, 53, 8, 202, 254, 2, 18, 47, 8, 248, 134, 7, 16, 1, 24,
	206, 253, 211, 9, 34, 4, 51, 55, 48, 48, 42, 4, 51, 55, 48, 48, 50, 1, 48, 56, 202, 254,
	2, 64, 201, 134, 245, 223, 218, 50, 72, 5, 80, 2, 90, 4, 51, 55, 48, 48, 50, 6, 8, 202,
	254, 2, 18, 0, 58, 6, 8, 202, 254, 2, 18, 0, 74, 24, 8, 248, 134, 7, 16, 1, 24, 2, 42, 1,
	49, 50, 3, 54, 46, 55, 66, 4, 48, 46, 49, 53, 72, 1, 82, 15, 8, 242, 199, 38, 18, 2, 51,
	48, 26, 2, 51, 48, 34, 1, 53, 88, 1, 96, 2, 112, 205, 253, 211, 9,
}

func TestGetMessageDescriptor_Success(t *testing.T) {

	module := "clst.buf.team/fleet/bk"
	version := "main"
	symbols := []string{"apollo.bk.v1.Event"}
	fullyQualifiedName := "luna.session.v1beta1.CalculationSession"

	respBytes, err := getMessageDescriptor(module, version, symbols, fullyQualifiedName)
	if err != nil {
		t.Fatalf("getFileDescriptorSet returned error: %v", err)
	}

	if respBytes == nil {
		t.Fatalf("getMessageDescriptor returned nil")
	}
}

// []byte("\"payload\": \"\n\fTradeCreated\u0012\rbktxprocessor\u0018�����2\" 50312-515789a6b1ed251bbefff2bd18�\u0006�\u0004\n2type.clearstreet.io/apollo.bk.v1.TradeCreatedEvent\u0012�\u0004\n�\u0003\b�����2\u0012 50312-515789a6b1ed251bbefff2bd18\u0018\u0002\"\n1847124536*\"cb60b808-67d136e10001c247-25-8dcbc8�����2@���\tH���\tP��\u0006`�3h\u0005r\u000516.55z\u000250�\u0001\u0002�\u0001\u0002�\u0001\u0001�\u0001\u0005827.5�\u0001\u0005827.5�\u0001��\u0006�\u0001\u00040.03�\u0001\u00041.41�\u0001\u00010�\u0001\u00010�\u0001\u00010�\u0001\u00010�\u0001\u00010�\u0001\u0002�\u0001\u0006�\u0002\u0004XNAS�\u0002\u0004ETBE�\u0002�\u0001�\u0002\u0001�\u0002\u000bDTCYUS33XXX�\u0003\u0005�\u0003�\u0001\nJ\n\u0004hash\u0012B\u001a@d072a9baba48297784151d2b373eda29cba437606d8c594bdb32b4e4434f8efa\n_\n\u0010partition_bucket\u0012K\u001aItrade_id=b05f4b5dacb348c6827252e5830b366527eb7060cefb2334409ee7ab1959c58a�\u0003\u0001J�\u0004\u000f\b\u0001\u0012\u00040.03\u0018\u0005\"\u0003USA�\u0004\u000f\b\u0002\u0012\u00041.41\u0018\u0005\"\u0003USA\u001aI20250312-7034e74952cde53cfa9c7ca8b2a4a8adf7e9c44eaaafdc71f36fa110178f327d\","),
func TestDeserializePayload_Success(t *testing.T) {
	record := &kgo.Record{
		Key: []byte(`{
			"bucketKey": {
				"partitionBucket": "trade_id=b05f4b5dacb348c6827252e5830b366527eb7060cefb2334409ee7ab1959c58a"
			}
	}`),
		Value: rawProtoLunaSessionCordEvents,
		Headers: []kgo.RecordHeader{
			{
				Key:   "protobuf.type.key",
				Value: []byte(`apollo.bk.v1.TransactionKey`),
			},
			{
				Key:   "key.encoding",
				Value: []byte(`proto`),
			},
			{
				Key:   "protobuf.type.value",
				Value: []byte(`luna.session.v1beta1.CalculationSession`),
			},
			{
				Key:   "value.encoding",
				Value: []byte("proto"),
			},
		},
	}
	var serdeInstance CLSTHeaderSchemaSerde

	recordPayload, err := serdeInstance.DeserializePayload(context.Background(), record, PayloadTypeValue)
	if err != nil {
		t.Fatalf("getFileDescriptorSet returned error: %v", err)
	}

	if recordPayload == nil {
		t.Fatalf("getMessageDescriptor returned nil")
	}
}

func TestGetSchemaInfoFromHeaders(t *testing.T) {
	// Create headers that mimic your payload.
	headers := []kgo.RecordHeader{
		{
			Key:   "key.encoding",
			Value: []byte(`{"payload": "proto", "encoding": "text"}`),
		},
		{
			Key:   "protobuf.type.key",
			Value: []byte(`{"payload": "apollo.bk.v1.TransactionKey", "encoding": "text"}`),
		},
		{
			Key:   "protobuf.type.value",
			Value: []byte(`{"payload": "apollo.bk.v1.Event", "encoding": "text"}`),
		},
		{
			Key:   "traceparent",
			Value: []byte(`{"payload": "00-67d1eb28000000007eb1bf859d0bb03a-6b3d8c0dd03af2e1-00", "encoding": "text"}`),
		},
		{
			Key:   "tracestate",
			Value: []byte(`{"payload": "dd=s:0;p:6b3d8c0dd03af2e1;t.tid:67d1eb2800000000", "encoding": "text"}`),
		},
		{
			Key:   "value.encoding",
			Value: []byte(`{"payload": "proto", "encoding": "text"}`),
		},
	}

	// Create a dummy record with these headers.
	record := &kgo.Record{
		Headers: headers,
	}

	// Call the function under test.
	info, err := getSchemaInfoFromHeaders(record)
	if err != nil {
		t.Fatalf("getSchemaInfoFromHeaders returned error: %v", err)
	}

	// Expected values (without extra quotes).
	expected := SchemaInfo{
		KeyEncoding:       "proto",
		ValueEncoding:     "proto",
		ProtobufTypeKey:   "apollo.bk.v1.TransactionKey",
		ProtobufTypeValue: "apollo.bk.v1.Event",
	}

	if info.KeyEncoding != expected.KeyEncoding {
		t.Errorf("KeyEncoding: got %q, want %q", info.KeyEncoding, expected.KeyEncoding)
	}
	if info.ValueEncoding != expected.ValueEncoding {
		t.Errorf("ValueEncoding: got %q, want %q", info.ValueEncoding, expected.ValueEncoding)
	}
	if info.ProtobufTypeKey != expected.ProtobufTypeKey {
		t.Errorf("ProtobufTypeKey: got %q, want %q", info.ProtobufTypeKey, expected.ProtobufTypeKey)
	}
	if info.ProtobufTypeValue != expected.ProtobufTypeValue {
		t.Errorf("ProtobufTypeValue: got %q, want %q", info.ProtobufTypeValue, expected.ProtobufTypeValue)
	}
}

func TestGetModule(t *testing.T) {
	// Test cases
	tests := []struct {
		name     string
		fullName string
		expected string
	}{
		{"Valid", "luna.session.v1beta1.CalculationUnit", "clst.buf.team/fleet/protocol"},
		{"Valid full name", "apollo.bk.v1.TransactionKey", "clst.buf.team/fleet/bk"},
		{"Another valid full name", "apollo.secfin.v1.Event", "clst.buf.team/fleet/secfin"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := getModule(tt.fullName)
			if result != tt.expected {
				t.Errorf("getModule(%q) = %q; want %q", tt.fullName, result, tt.expected)
			}
		})
	}
}

func TestInspectRawProtobuf(t *testing.T) {
	jsonBytes := rawProtoBKTransactionKey

	inspectRawProtobuf(jsonBytes, "")
}

func TestFixKeys(t *testing.T) {
	jsonBytes, err := os.ReadFile("../../../bk_luna_calculation_session.json")
	if err != nil {
		fmt.Printf("failed to read file: %v", err)
	}
	fixKeys(jsonBytes)
}
