// Copyright 2024 Redpanda Data, Inc.
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
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// TestDeserializeConsumerOffset tests the deserializeConsumerOffset function with various cases.
func TestDeserializeConsumerOffset(t *testing.T) {
	service := &Service{}

	var (
		// GroupOffsetCommit
		offsetCommitKeyV1   = createOffsetCommitKey(1, "order-service", "orders", 0)
		offsetCommitValueV3 = createOffsetCommitValue(3, 48267, 1, "order-service-uuid", 1722723528859, 0)

		// GroupMetaData
		groupMetadataKeyV2   = createGroupMetadataKey(2, "connectors-cluster")
		groupMetadataValueV3 = createGroupMetadataValue(3, "connect", 8, nil, nil, 1722705924100)
	)

	assert := assert.New(t)
	require := require.New(t)

	tests := []struct {
		name       string
		record     func() *kgo.Record
		validateFn func(key, value *RecordPayload, err error)
	}{
		{
			name: "Unknown Message Version",
			record: func() *kgo.Record {
				return &kgo.Record{
					Key:   []byte{0xff, 0xff},
					Value: []byte{0xff, 0xff},
				}
			},
			validateFn: func(key, val *RecordPayload, err error) {
				assert.Nil(key)
				assert.Nil(val)
				assert.Error(err)
			},
		},
		{
			name: "Invalid GroupOffsetCommit (key is nil)",
			record: func() *kgo.Record {
				return &kgo.Record{
					Key:   nil,
					Value: offsetCommitValueV3.BinarySerialized,
				}
			},
			validateFn: func(key, value *RecordPayload, err error) {
				assert.Nil(key)
				assert.Nil(value)
				assert.Error(err)
			},
		},
		{
			name: "Valid GroupOffsetCommit commits an offset",
			record: func() *kgo.Record {
				return &kgo.Record{
					Key:   offsetCommitKeyV1.BinarySerialized,
					Value: offsetCommitValueV3.BinarySerialized,
				}
			},
			validateFn: func(key, value *RecordPayload, err error) {
				require.NoError(err)
				assert.Equal(key.NormalizedPayload, offsetCommitKeyV1.JSONSerialized)
				assert.Equal(key.DeserializedPayload, offsetCommitKeyV1.Original)

				assert.Equal(value.NormalizedPayload, offsetCommitValueV3.JSONSerialized)
				assert.Equal(value.DeserializedPayload, offsetCommitValueV3.Original)
			},
		},
		{
			name: "Valid GroupOffsetCommit that resets offset (value is nil)",
			record: func() *kgo.Record {
				return &kgo.Record{
					Key:   offsetCommitKeyV1.BinarySerialized,
					Value: nil,
				}
			},
			validateFn: func(key, value *RecordPayload, err error) {
				require.NoError(err)
				assert.Equal(key.NormalizedPayload, offsetCommitKeyV1.JSONSerialized)
				assert.Equal(key.DeserializedPayload, offsetCommitKeyV1.Original)
				require.NotNil(value)
				assert.Equal(PayloadEncodingNull, value.Encoding)
			},
		},
		{
			name: "Invalid GroupOffsetCommit (key is binary nonsense)",
			record: func() *kgo.Record {
				return &kgo.Record{
					Key:   []byte{0xff, 0xff, 0x0E, 0x00},
					Value: nil,
				}
			},
			validateFn: func(key, value *RecordPayload, err error) {
				assert.Nil(key)
				assert.Nil(value)
				assert.Error(err)
			},
		},
		{
			name: "Invalid GroupOffsetCommit (value is binary nonsense)",
			record: func() *kgo.Record {
				return &kgo.Record{
					Key:   offsetCommitKeyV1.BinarySerialized,
					Value: []byte{0xff, 0xff, 0x0E, 0x00},
				}
			},
			validateFn: func(key, value *RecordPayload, err error) {
				assert.Nil(key)
				assert.Nil(value)
				assert.Error(err)
			},
		},
		{
			name: "Valid GroupMetadata",
			record: func() *kgo.Record {
				return &kgo.Record{
					Key:   groupMetadataKeyV2.BinarySerialized,
					Value: groupMetadataValueV3.BinarySerialized,
				}
			},
			validateFn: func(key, value *RecordPayload, err error) {
				require.NoError(err)
				assert.Equal(key.NormalizedPayload, groupMetadataKeyV2.JSONSerialized)
				assert.Equal(key.DeserializedPayload, groupMetadataKeyV2.Original)

				assert.Equal(value.NormalizedPayload, groupMetadataValueV3.JSONSerialized)
				assert.Equal(value.DeserializedPayload, groupMetadataValueV3.Original)
			},
		},
		// Below code tests a case which is not yet supported, see: https://github.com/twmb/franz-go/issues/799
		// {
		// 	name: "Debug",
		// 	record: func() *kgo.Record {
		// 		keyB64 := "AAIAEmNvbm5lY3RvcnMtY2x1c3Rlcg=="
		// 		valueB64 := "AAMAB2Nvbm5lY3QAAAAJAAlzZXNzaW9uZWQAPGNvbm5lY3QtMTcyLjIzLjAuNTo4MDgzLTRhNjQ2YTJjLTQ5YjMtNDE4ZC05MjJlLWY4ZDdkMjk4MTRjYgAAAZEZRlAJAAAAAQADADxjb25uZWN0LTE3Mi4yMy4wLjU6ODA4My00YTY0NmEyYy00OWIzLTQxOGQtOTIyZS1mOGQ3ZDI5ODE0Y2L//wAXY29ubmVjdC0xNzIuMjMuMC41OjgwODMACjE3Mi4yMy4wLjUAAOpgAAAnEAAAAJYAAgAXaHR0cDovLzE3Mi4yMy4wLjU6ODA4My8AAAAAAAAAMQAAAG8AAgAAADxjb25uZWN0LTE3Mi4yMy4wLjU6ODA4My0wNDhmYzNkNC1lZTJkLTQ1NDgtYWIzYi01MWI1NWFjNDQxZjcAF2h0dHA6Ly8xNzIuMjMuMC41OjgwODMvAAAAAAAAAC0AAAAAAAAAAAAAAAAAAABvAAIAAAA8Y29ubmVjdC0xNzIuMjMuMC41OjgwODMtNGE2NDZhMmMtNDliMy00MThkLTkyMmUtZjhkN2QyOTgxNGNiABdodHRwOi8vMTcyLjIzLjAuNTo4MDgzLwAAAAAAAAAxAAAAAAAAAAAAAAAA"
		//
		// 		key, err := base64.StdEncoding.DecodeString(keyB64)
		// 		require.NoError(err)
		// 		value, err := base64.StdEncoding.DecodeString(valueB64)
		// 		require.NoError(err)
		//
		// 		return &kgo.Record{
		// 			Key:   key,
		// 			Value: value,
		// 		}
		// 	},
		// 	validateFn: func(key, value *RecordPayload, err error) {
		// 		assert.NoError(err)
		// 		assert.NotNil(key)
		// 		assert.NotNil(value)
		// 	},
		// },
	}

	for _, tt := range tests {
		t.Run(tt.name, func(*testing.T) {
			result, err := service.deserializeConsumerOffset(tt.record())
			var key, value *RecordPayload
			if result != nil {
				key = result.Key
				value = result.Value
			}
			tt.validateFn(key, value, err)
		})
	}
}

type kmsgTestResponse struct {
	BinarySerialized []byte
	JSONSerialized   []byte
	Original         any
}

// createOffsetCommitKey creates a byte slice for offset commit key with the given version.
func createOffsetCommitKey(version int16, group, topic string, partition int32) kmsgTestResponse {
	offsetCommitKey := kmsg.NewOffsetCommitKey()
	offsetCommitKey.Version = version
	offsetCommitKey.Group = group
	offsetCommitKey.Topic = topic
	offsetCommitKey.Partition = partition

	var keyData []byte
	keyData = offsetCommitKey.AppendTo(keyData)

	jsonBytes, _ := json.Marshal(offsetCommitKey)

	return kmsgTestResponse{
		BinarySerialized: keyData,
		JSONSerialized:   jsonBytes,
		Original:         offsetCommitKey,
	}
}

// createOffsetCommitValue creates a byte slice for offset commit value with the given parameters.
func createOffsetCommitValue(version int16, offset int64, leaderEpoch int32, metadata string, commitTimestamp int64, expireTimestamp int64) kmsgTestResponse {
	offsetCommitValue := kmsg.NewOffsetCommitValue()
	offsetCommitValue.Version = version
	offsetCommitValue.Offset = offset
	offsetCommitValue.LeaderEpoch = leaderEpoch
	offsetCommitValue.Metadata = metadata
	offsetCommitValue.CommitTimestamp = commitTimestamp
	offsetCommitValue.ExpireTimestamp = expireTimestamp

	var valueData []byte
	valueData = offsetCommitValue.AppendTo(valueData)

	jsonBytes, _ := json.Marshal(offsetCommitValue)

	return kmsgTestResponse{
		BinarySerialized: valueData,
		JSONSerialized:   jsonBytes,
		Original:         offsetCommitValue,
	}
}

// createGroupMetadataKey creates a byte slice for group metadata key with the given parameters.
func createGroupMetadataKey(version int16, group string) kmsgTestResponse {
	groupMetadataKey := kmsg.NewGroupMetadataKey()
	groupMetadataKey.Version = version
	groupMetadataKey.Group = group

	var keyData []byte
	keyData = groupMetadataKey.AppendTo(keyData)

	jsonBytes, _ := json.Marshal(groupMetadataKey)

	return kmsgTestResponse{
		BinarySerialized: keyData,
		JSONSerialized:   jsonBytes,
		Original:         groupMetadataKey,
	}
}

// createGroupMetadataValue creates a byte slice for group metadata value with the given parameters.
func createGroupMetadataValue(version int16, protocolType string, generation int32, protocol *string, leader *string, currentStateTimestamp int64, members ...kmsg.GroupMetadataValueMember) kmsgTestResponse {
	groupMetadataValue := kmsg.NewGroupMetadataValue()
	groupMetadataValue.Version = version
	groupMetadataValue.ProtocolType = protocolType
	groupMetadataValue.Generation = generation
	groupMetadataValue.Protocol = protocol
	groupMetadataValue.Leader = leader
	groupMetadataValue.CurrentStateTimestamp = currentStateTimestamp
	groupMetadataValue.Members = members

	var valueData []byte
	valueData = groupMetadataValue.AppendTo(valueData)

	jsonBytes, _ := json.Marshal(groupMetadataValue)

	return kmsgTestResponse{
		BinarySerialized: valueData,
		JSONSerialized:   jsonBytes,
		Original:         groupMetadataValue,
	}
}
