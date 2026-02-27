// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/twmb/franz-go/pkg/kadm"
)

// pageToken represents the pagination cursor state for ListMessages requests.
// It encodes per-partition offset information to enable stateless pagination
// across multiple API calls.
type pageToken struct {
	TopicName  string            `json:"t"`  // Topic name for validation
	Partitions []partitionCursor `json:"p"`  // Per-partition cursor state
	Direction  string            `json:"d"`  // directionDescending or directionAscending
	PageSize   int               `json:"ps"` // Messages per page
}

// partitionCursor represents the offset state for a single partition.
type partitionCursor struct {
	ID            int32 `json:"id"` // Partition ID
	NextOffset    int64 `json:"no"` // Next offset to read from
	LowWaterMark  int64 `json:"lw"` // Low water mark (for validation)
	HighWaterMark int64 `json:"hw"` // High water mark (for validation)
}

// Encode serializes the page token to a URL-safe base64 string.
func (pt *pageToken) Encode() (string, error) {
	// Validate before encoding
	if err := pt.Validate(); err != nil {
		return "", fmt.Errorf("invalid page token: %w", err)
	}

	jsonBytes, err := json.Marshal(pt)
	if err != nil {
		return "", fmt.Errorf("failed to marshal page token: %w", err)
	}

	// Use URL-safe base64 encoding (no padding)
	encoded := base64.RawURLEncoding.EncodeToString(jsonBytes)
	return encoded, nil
}

// decodePageToken deserializes a page token from a base64 string.
func decodePageToken(encoded string) (*pageToken, error) {
	if encoded == "" {
		return nil, errors.New("page token is empty")
	}

	// Decode from URL-safe base64
	jsonBytes, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("failed to decode page token: %w", err)
	}

	var token pageToken
	if err := json.Unmarshal(jsonBytes, &token); err != nil {
		return nil, fmt.Errorf("failed to unmarshal page token: %w", err)
	}

	// Validate after decoding
	if err := token.Validate(); err != nil {
		return nil, fmt.Errorf("invalid page token: %w", err)
	}

	return &token, nil
}

// Validate checks if the page token is valid.
func (pt *pageToken) Validate() error {
	if pt.TopicName == "" {
		return errors.New("topic name is empty")
	}

	if len(pt.Partitions) == 0 {
		return errors.New("no partition cursors")
	}

	if pt.Direction != directionDescending && pt.Direction != directionAscending {
		return fmt.Errorf("invalid direction: %s (must be 'desc' or 'asc')", pt.Direction)
	}

	if pt.PageSize <= 0 || pt.PageSize > 500 {
		return fmt.Errorf("invalid page size: %d (must be between 1 and 500)", pt.PageSize)
	}

	const maxTotalMessages = 100_000
	if int64(pt.PageSize)*int64(len(pt.Partitions)) > maxTotalMessages {
		return fmt.Errorf("page size %d with %d partitions exceeds max total messages (%d)",
			pt.PageSize, len(pt.Partitions), maxTotalMessages)
	}

	// Validate each partition cursor
	for i, cursor := range pt.Partitions {
		if cursor.ID < 0 {
			return fmt.Errorf("partition %d: invalid ID: %d", i, cursor.ID)
		}

		// NextOffset can be -1 when a partition is exhausted in descending mode
		// (when we've read all messages back to offset 0)
		if cursor.NextOffset < -1 {
			return fmt.Errorf("partition %d: invalid next offset: %d", i, cursor.NextOffset)
		}

		if cursor.LowWaterMark < 0 {
			return fmt.Errorf("partition %d: invalid low water mark: %d", i, cursor.LowWaterMark)
		}

		if cursor.HighWaterMark < 0 {
			return fmt.Errorf("partition %d: invalid high water mark: %d", i, cursor.HighWaterMark)
		}

		if cursor.HighWaterMark < cursor.LowWaterMark {
			return fmt.Errorf("partition %d: high water mark (%d) < low water mark (%d)", i, cursor.HighWaterMark, cursor.LowWaterMark)
		}
	}

	return nil
}

// createInitialPageToken creates a new page token for the first page of results.
// It initializes partition cursors based on the specified direction:
// - directionDescending: Start from high water mark (newest messages first)
// - directionAscending: Start from low water mark (oldest messages first)
func createInitialPageToken(
	topicName string,
	startOffsets, endOffsets kadm.ListedOffsets,
	pageSize int,
	direction string,
) (*pageToken, error) {
	if topicName == "" {
		return nil, errors.New("topic name is empty")
	}

	if pageSize <= 0 || pageSize > 10_000 {
		return nil, fmt.Errorf("invalid page size: %d (must be between 1 and 10000)", pageSize)
	}

	if direction != directionDescending && direction != directionAscending {
		return nil, fmt.Errorf("invalid direction: %s (must be 'desc' or 'asc')", direction)
	}

	var partitions []partitionCursor

	// Build cursors from water marks
	startOffsets.Each(func(start kadm.ListedOffset) {
		// Find corresponding end offset
		end, exists := endOffsets.Lookup(topicName, start.Partition)
		if !exists {
			// Skip partitions without end offset
			return
		}

		var nextOffset int64
		if direction == directionDescending {
			// For descending order, start from high water mark
			// NextOffset points to the highest consumable offset (HWM - 1)
			nextOffset = max(end.Offset-1, start.Offset)
		} else {
			// For ascending order, start from low water mark
			// NextOffset points to the lowest consumable offset (LWM)
			nextOffset = start.Offset
		}

		cursor := partitionCursor{
			ID:            start.Partition,
			NextOffset:    nextOffset,
			LowWaterMark:  start.Offset,
			HighWaterMark: end.Offset,
		}

		partitions = append(partitions, cursor)
	})

	if len(partitions) == 0 {
		return nil, errors.New("no partitions available")
	}

	token := &pageToken{
		TopicName:  topicName,
		Partitions: partitions,
		Direction:  direction,
		PageSize:   pageSize,
	}

	return token, nil
}

// HasMore returns true if there are more messages to fetch for any partition.
func (pt *pageToken) HasMore() bool {
	for _, cursor := range pt.Partitions {
		// Check if cursor has more messages to read based on direction
		if pt.Direction == directionDescending {
			// Descending: exhausted when nextOffset < lowWaterMark
			if cursor.NextOffset >= cursor.LowWaterMark {
				return true
			}
		} else {
			// Ascending: exhausted when nextOffset >= highWaterMark
			if cursor.NextOffset < cursor.HighWaterMark {
				return true
			}
		}
	}
	return false
}

// IsExhausted returns true if the given partition has no more messages.
// Direction is needed to determine if we're going forward or backward.
func (pt *pageToken) IsExhausted(partitionID int32) bool {
	for _, cursor := range pt.Partitions {
		if cursor.ID == partitionID {
			if pt.Direction == directionDescending {
				return cursor.NextOffset < cursor.LowWaterMark
			}
			return cursor.NextOffset >= cursor.HighWaterMark
		}
	}
	return true
}
