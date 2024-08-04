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
	"encoding/json"
	"fmt"

	"github.com/twmb/franz-go/pkg/kbin"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// deserializeConsumerOffset deserializes the binary messages in the __consumer_offsets topic
func (*Service) deserializeConsumerOffset(record *kgo.Record) (*Record, error) {
	if len(record.Key) < 2 {
		return nil, fmt.Errorf("offset commit key is supposed to be at least 2 bytes long")
	}

	// 1. Figure out what kind of message we've got. On this topic we'll find OffsetCommits as well as GroupMetadata
	// messages.
	messageVer := (&kbin.Reader{Src: record.Key}).Int16()

	var deserializedKey *RecordPayload
	var deserializedVal *RecordPayload
	var err error

	switch messageVer {
	case 0, 1:
		// We got an offset commit message
		deserializedKey, err = deserializeOffsetCommitKey(record.Key)
		if err != nil {
			return nil, err
		}

		deserializedVal, err = deserializeOffsetCommitValue(record.Value)
		if err != nil {
			return nil, err
		}
	case 2:
		// We got a group metadata message
		deserializedKey, err = deserializeGroupMetadataKey(record.Key)
		if err != nil {
			return nil, err
		}

		deserializedVal, err = deserializeGroupMetadataValue(record.Value)
		if err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unknown message version '%d' detected", messageVer)
	}

	if deserializedKey == nil {
		deserializedKey = &RecordPayload{Encoding: PayloadEncodingNull}
	}
	if deserializedVal == nil {
		// Tombstone
		deserializedVal = &RecordPayload{Encoding: PayloadEncodingNull}
	}

	return &Record{
		Key:     deserializedKey,
		Value:   deserializedVal,
		Headers: recordHeaders(record),
	}, nil
}

// deserializeOffsetCommitKey deserializes the key of an offset commit message.
func deserializeOffsetCommitKey(key []byte) (*RecordPayload, error) {
	if len(key) == 0 {
		return nil, nil
	}

	offsetCommitKey := kmsg.NewOffsetCommitKey()
	err := offsetCommitKey.ReadFrom(key)
	if err != nil {
		return nil, fmt.Errorf("failed to deserialize offset commit key: %v", err)
	}

	jsonBytes, err := json.Marshal(offsetCommitKey)
	if err != nil {
		return nil, fmt.Errorf("failed serializing the offset commit key into JSON: %w", err)
	}
	return &RecordPayload{
		OriginalPayload:     key,
		PayloadSizeBytes:    len(key),
		DeserializedPayload: offsetCommitKey,
		NormalizedPayload:   jsonBytes,
		Encoding:            PayloadEncodingConsumerOffsets,
	}, nil
}

// deserializeOffsetCommitValue deserializes the value of an offset commit message.
func deserializeOffsetCommitValue(value []byte) (*RecordPayload, error) {
	if len(value) == 0 {
		return nil, nil
	}

	offsetCommitValue := kmsg.NewOffsetCommitValue()
	err := offsetCommitValue.ReadFrom(value)
	if err != nil {
		return nil, fmt.Errorf("failed to deserialize offset commit value: %w", err)
	}
	jsonBytes, err := json.Marshal(offsetCommitValue)
	if err != nil {
		return nil, fmt.Errorf("failed serializing the offset commit value into JSON: %w", err)
	}
	return &RecordPayload{
		OriginalPayload:     value,
		PayloadSizeBytes:    len(value),
		DeserializedPayload: offsetCommitValue,
		NormalizedPayload:   jsonBytes,
		Encoding:            PayloadEncodingConsumerOffsets,
	}, nil
}

// deserializeGroupMetadataKey deserializes the key of a group metadata message.
func deserializeGroupMetadataKey(key []byte) (*RecordPayload, error) {
	if len(key) == 0 {
		return nil, nil
	}

	metadataKey := kmsg.NewGroupMetadataKey()
	err := metadataKey.ReadFrom(key)
	if err != nil {
		return nil, fmt.Errorf("failed to deserialize group metadata key: %w", err)
	}
	jsonBytes, err := json.Marshal(metadataKey)
	if err != nil {
		return nil, fmt.Errorf("failed serializing the group metadata key into JSON: %w", err)
	}
	return &RecordPayload{
		OriginalPayload:     key,
		PayloadSizeBytes:    len(key),
		DeserializedPayload: metadataKey,
		NormalizedPayload:   jsonBytes,
		Encoding:            PayloadEncodingConsumerOffsets,
	}, nil
}

// deserializeGroupMetadataValue deserializes the value of a group metadata message.
func deserializeGroupMetadataValue(value []byte) (*RecordPayload, error) {
	if len(value) == 0 {
		return nil, nil
	}

	metadataValue := kmsg.NewGroupMetadataValue()
	err := metadataValue.ReadFrom(value)
	if err != nil {
		return nil, fmt.Errorf("failed to deserialize group metadata value: %w", err)
	}

	jsonBytes, err := json.Marshal(metadataValue)
	if err != nil {
		return nil, fmt.Errorf("failed serializing the group metadata value into JSON: %w", err)
	}

	return &RecordPayload{
		OriginalPayload:     value,
		PayloadSizeBytes:    len(value),
		DeserializedPayload: metadataValue,
		NormalizedPayload:   jsonBytes,
		Encoding:            PayloadEncodingConsumerOffsets,
	}, nil
}
