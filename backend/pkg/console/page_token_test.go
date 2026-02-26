// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kadm"
)

func Test_pageToken_EncodeDecodeRoundTrip(t *testing.T) {
	token := &pageToken{
		TopicName: "test-topic",
		Partitions: []partitionCursor{
			{ID: 0, NextOffset: 1000, LowWaterMark: 0, HighWaterMark: 1500},
			{ID: 1, NextOffset: 2000, LowWaterMark: 0, HighWaterMark: 2500},
			{ID: 2, NextOffset: 1500, LowWaterMark: 0, HighWaterMark: 2000},
		},
		Direction: directionDescending,
		PageSize:  50,
	}

	// Encode
	encoded, err := token.Encode()
	require.NoError(t, err)
	assert.NotEmpty(t, encoded)

	// Decode
	decoded, err := decodePageToken(encoded)
	require.NoError(t, err)

	// Verify round-trip
	assert.Equal(t, token.TopicName, decoded.TopicName)
	assert.Equal(t, token.Direction, decoded.Direction)
	assert.Equal(t, token.PageSize, decoded.PageSize)
	assert.Len(t, decoded.Partitions, 3)

	for i, cursor := range token.Partitions {
		assert.Equal(t, cursor.ID, decoded.Partitions[i].ID)
		assert.Equal(t, cursor.NextOffset, decoded.Partitions[i].NextOffset)
		assert.Equal(t, cursor.LowWaterMark, decoded.Partitions[i].LowWaterMark)
		assert.Equal(t, cursor.HighWaterMark, decoded.Partitions[i].HighWaterMark)
	}
}

func Test_pageToken_ValidateErrors(t *testing.T) {
	tests := []struct {
		name      string
		token     *pageToken
		expectErr string
	}{
		{
			name: "empty topic name",
			token: &pageToken{
				TopicName:  "",
				Partitions: []partitionCursor{{ID: 0, NextOffset: 100, LowWaterMark: 0, HighWaterMark: 200}},
				Direction:  "desc",
				PageSize:   50,
			},
			expectErr: "topic name is empty",
		},
		{
			name: "invalid direction",
			token: &pageToken{
				TopicName:  "test",
				Partitions: []partitionCursor{{ID: 0, NextOffset: 100, LowWaterMark: 0, HighWaterMark: 200}},
				Direction:  "invalid",
				PageSize:   50,
			},
			expectErr: "invalid direction",
		},
		{
			name: "invalid page size - too small",
			token: &pageToken{
				TopicName:  "test",
				Partitions: []partitionCursor{{ID: 0, NextOffset: 100, LowWaterMark: 0, HighWaterMark: 200}},
				Direction:  "desc",
				PageSize:   0,
			},
			expectErr: "invalid page size",
		},
		{
			name: "invalid page size - too large",
			token: &pageToken{
				TopicName:  "test",
				Partitions: []partitionCursor{{ID: 0, NextOffset: 100, LowWaterMark: 0, HighWaterMark: 200}},
				Direction:  "desc",
				PageSize:   501,
			},
			expectErr: "invalid page size",
		},
		{
			name: "next offset -2 (too negative)",
			token: &pageToken{
				TopicName:  "test",
				Partitions: []partitionCursor{{ID: 0, NextOffset: -2, LowWaterMark: 0, HighWaterMark: 200}},
				Direction:  "desc",
				PageSize:   50,
			},
			expectErr: "invalid next offset",
		},
		{
			name: "high water mark < low water mark",
			token: &pageToken{
				TopicName:  "test",
				Partitions: []partitionCursor{{ID: 0, NextOffset: 100, LowWaterMark: 200, HighWaterMark: 100}},
				Direction:  "desc",
				PageSize:   50,
			},
			expectErr: "high water mark",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.token.Validate()
			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.expectErr)
		})
	}
}

func Test_decodePageToken_InvalidBase64(t *testing.T) {
	_, err := decodePageToken("not-valid-base64!!!")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to decode")
}

func Test_decodePageToken_InvalidJSON(t *testing.T) {
	// Valid base64 but invalid JSON
	_, err := decodePageToken("bm90LWpzb24")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to unmarshal")
}

func Test_createInitialPageToken(t *testing.T) {
	// Mock kadm.ListedOffsets
	startOffsets := kadm.ListedOffsets{
		"test-topic": {
			0: {Topic: "test-topic", Partition: 0, Offset: 0},
			1: {Topic: "test-topic", Partition: 1, Offset: 0},
			2: {Topic: "test-topic", Partition: 2, Offset: 100},
		},
	}

	endOffsets := kadm.ListedOffsets{
		"test-topic": {
			0: {Topic: "test-topic", Partition: 0, Offset: 1000},
			1: {Topic: "test-topic", Partition: 1, Offset: 2000},
			2: {Topic: "test-topic", Partition: 2, Offset: 1500},
		},
	}

	token, err := createInitialPageToken("test-topic", startOffsets, endOffsets, 50, directionDescending)
	require.NoError(t, err)

	assert.Equal(t, "test-topic", token.TopicName)
	assert.Equal(t, directionDescending, token.Direction)
	assert.Equal(t, 50, token.PageSize)
	assert.Len(t, token.Partitions, 3)

	// Check that NextOffset is set to HWM - 1 for descending
	// Build map by partition ID since order is not guaranteed
	partByID := make(map[int32]partitionCursor)
	for _, p := range token.Partitions {
		partByID[p.ID] = p
	}
	assert.Equal(t, int64(999), partByID[0].NextOffset)
	assert.Equal(t, int64(1999), partByID[1].NextOffset)
	assert.Equal(t, int64(1499), partByID[2].NextOffset)
}

func Test_createInitialPageToken_EmptyTopic(t *testing.T) {
	startOffsets := kadm.ListedOffsets{
		"test-topic": {
			0: {Topic: "test-topic", Partition: 0, Offset: 0},
		},
	}

	endOffsets := kadm.ListedOffsets{
		"test-topic": {
			0: {Topic: "test-topic", Partition: 0, Offset: 0},
		},
	}

	token, err := createInitialPageToken("test-topic", startOffsets, endOffsets, 50, directionDescending)
	require.NoError(t, err)

	// NextOffset should be clamped to low water mark for empty topic
	assert.Equal(t, int64(0), token.Partitions[0].NextOffset)
}

func Test_pageToken_HasMore(t *testing.T) {
	tests := []struct {
		name     string
		token    *pageToken
		expected bool
	}{
		{
			name: "has more messages",
			token: &pageToken{
				TopicName: "test",
				Partitions: []partitionCursor{
					{ID: 0, NextOffset: 100, LowWaterMark: 0, HighWaterMark: 200},
					{ID: 1, NextOffset: 150, LowWaterMark: 0, HighWaterMark: 300},
				},
				Direction: directionDescending,
				PageSize:  50,
			},
			expected: true,
		},
		{
			name: "no more messages - all exhausted",
			token: &pageToken{
				TopicName: "test",
				Partitions: []partitionCursor{
					{ID: 0, NextOffset: -1, LowWaterMark: 0, HighWaterMark: 200},
					{ID: 1, NextOffset: -1, LowWaterMark: 0, HighWaterMark: 300},
				},
				Direction: directionDescending,
				PageSize:  50,
			},
			expected: false,
		},
		{
			name: "some partitions exhausted",
			token: &pageToken{
				TopicName: "test",
				Partitions: []partitionCursor{
					{ID: 0, NextOffset: -1, LowWaterMark: 0, HighWaterMark: 200},
					{ID: 1, NextOffset: 50, LowWaterMark: 0, HighWaterMark: 300},
				},
				Direction: directionDescending,
				PageSize:  50,
			},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.token.HasMore()
			assert.Equal(t, tt.expected, result)
		})
	}
}

func Test_pageToken_IsExhausted(t *testing.T) {
	tests := []struct {
		name        string
		token       *pageToken
		partitionID int32
		expected    bool
	}{
		{
			name: "descending - not exhausted",
			token: &pageToken{
				Direction: directionDescending,
				Partitions: []partitionCursor{
					{ID: 0, NextOffset: 100, LowWaterMark: 0, HighWaterMark: 200},
				},
			},
			partitionID: 0,
			expected:    false,
		},
		{
			name: "descending - exhausted below low water mark",
			token: &pageToken{
				Direction: directionDescending,
				Partitions: []partitionCursor{
					{ID: 0, NextOffset: -1, LowWaterMark: 0, HighWaterMark: 200},
				},
			},
			partitionID: 0,
			expected:    true,
		},
		{
			name: "descending - at low water mark boundary",
			token: &pageToken{
				Direction: directionDescending,
				Partitions: []partitionCursor{
					{ID: 0, NextOffset: 0, LowWaterMark: 0, HighWaterMark: 200},
				},
			},
			partitionID: 0,
			expected:    false,
		},
		{
			name: "ascending - not exhausted",
			token: &pageToken{
				Direction: directionAscending,
				Partitions: []partitionCursor{
					{ID: 0, NextOffset: 100, LowWaterMark: 0, HighWaterMark: 200},
				},
			},
			partitionID: 0,
			expected:    false,
		},
		{
			name: "ascending - exhausted at high water mark",
			token: &pageToken{
				Direction: directionAscending,
				Partitions: []partitionCursor{
					{ID: 0, NextOffset: 200, LowWaterMark: 0, HighWaterMark: 200},
				},
			},
			partitionID: 0,
			expected:    true,
		},
		{
			name: "ascending - one below high water mark boundary",
			token: &pageToken{
				Direction: directionAscending,
				Partitions: []partitionCursor{
					{ID: 0, NextOffset: 199, LowWaterMark: 0, HighWaterMark: 200},
				},
			},
			partitionID: 0,
			expected:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.token.IsExhausted(tt.partitionID)
			assert.Equal(t, tt.expected, result)
		})
	}
}
