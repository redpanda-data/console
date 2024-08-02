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
	switch messageVer {
	case 0, 1:
		// We got an offset commit message
		offsetCommitKey := kmsg.NewOffsetCommitKey()
		err := offsetCommitKey.ReadFrom(record.Key)
		if err == nil {
			jsonBytes, err := json.Marshal(offsetCommitKey)
			if err != nil {
				return nil, fmt.Errorf("failed serializing the offset commit key into JSON: %w", err)
			}

			deserializedKey = &RecordPayload{
				OriginalPayload:     record.Key,
				PayloadSizeBytes:    len(record.Key),
				DeserializedPayload: offsetCommitKey,
				NormalizedPayload:   jsonBytes,
				Encoding:            PayloadEncodingConsumerOffsets,
			}
		}

		if record.Value == nil {
			break
		}
		offsetCommitValue := kmsg.NewOffsetCommitValue()
		err = offsetCommitValue.ReadFrom(record.Value)
		if err == nil {
			jsonBytes, err := json.Marshal(offsetCommitValue)
			if err != nil {
				return nil, fmt.Errorf("failed serializing the offset commit value into JSON: %w", err)
			}

			deserializedVal = &RecordPayload{
				OriginalPayload:     record.Value,
				PayloadSizeBytes:    len(record.Value),
				NormalizedPayload:   jsonBytes,
				DeserializedPayload: offsetCommitValue,
				Encoding:            PayloadEncodingConsumerOffsets,
			}
		}
	case 2:
		// We got a group metadata message
		metadataKey := kmsg.NewGroupMetadataKey()
		err := metadataKey.ReadFrom(record.Key)
		if err == nil {
			jsonBytes, err := json.Marshal(metadataKey)
			if err != nil {
				return nil, fmt.Errorf("failed serializing the group metadata key into JSON: %w", err)
			}

			deserializedKey = &RecordPayload{
				OriginalPayload:     record.Key,
				PayloadSizeBytes:    len(record.Key),
				NormalizedPayload:   jsonBytes,
				DeserializedPayload: metadataKey,
				Encoding:            PayloadEncodingConsumerOffsets,
			}
		}

		if record.Value == nil {
			break
		}
		metadataValue := kmsg.NewGroupMetadataValue()
		err = metadataValue.ReadFrom(record.Value)
		if err == nil {
			jsonBytes, err := json.Marshal(metadataValue)
			if err != nil {
				return nil, fmt.Errorf("failed serializing the group metadata value into JSON: %w", err)
			}
			deserializedVal = &RecordPayload{
				OriginalPayload:     record.Value,
				NormalizedPayload:   jsonBytes,
				DeserializedPayload: metadataValue,
				PayloadSizeBytes:    len(record.Value),
			}
		}
	default:
		// Unknown format
		return nil, fmt.Errorf("unknown message version '%d' detected", messageVer)
	}

	if deserializedKey == nil {
		deserializedKey = &RecordPayload{
			OriginalPayload:  record.Key,
			PayloadSizeBytes: len(record.Key),
			Encoding:         PayloadEncodingNull,
		}
	}
	if deserializedVal == nil {
		// Tombstone
		deserializedVal = &RecordPayload{
			OriginalPayload:  record.Value,
			PayloadSizeBytes: len(record.Value),
			Encoding:         PayloadEncodingNull,
		}
	}

	return &Record{
		Key:     deserializedKey,
		Value:   deserializedVal,
		Headers: recordHeaders(record),
	}, nil
}
