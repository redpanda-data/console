// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package httptypes contains the types for HTTP requests and responses.
package httptypes

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
)

// ListMessagesRequest represents a search message request with all search parameter. This must be public as it's
// used in Console Enterprise to implement the hooks.
type ListMessagesRequest struct {
	TopicName             string `json:"topicName"`
	StartOffset           int64  `json:"startOffset"`    // -1 for recent (newest - results), -2 for oldest offset, -3 for newest, -4 for timestamp
	StartTimestamp        int64  `json:"startTimestamp"` // Start offset by unix timestamp in ms (only considered if start offset is set to -4)
	PartitionID           int32  `json:"partitionId"`    // -1 for all partition ids
	MaxResults            int    `json:"maxResults"`
	FilterInterpreterCode string `json:"filterInterpreterCode"` // Base64 encoded code

	// Enterprise may only be set in the Enterprise mode. The JSON deserialization is deferred
	// to the enterprise backend.
	Enterprise json.RawMessage `json:"enterprise,omitempty"`
}

// OK validates the user input for the list messages request.
func (l *ListMessagesRequest) OK() error {
	if l.TopicName == "" {
		return fmt.Errorf("topic name is required")
	}

	if l.StartOffset < -4 {
		return fmt.Errorf("start offset is smaller than -4")
	}

	if l.PartitionID < -1 {
		return fmt.Errorf("partitionID is smaller than -1")
	}

	if l.MaxResults <= 0 || l.MaxResults > 500 {
		return fmt.Errorf("max results must be between 1 and 500")
	}

	if _, err := l.DecodeInterpreterCode(); err != nil {
		return fmt.Errorf("failed to decode interpreter code %w", err)
	}

	return nil
}

// DecodeInterpreterCode base64-decodes the provided interpreter code and returns it as a string.
func (l *ListMessagesRequest) DecodeInterpreterCode() (string, error) {
	code, err := base64.StdEncoding.DecodeString(l.FilterInterpreterCode)
	if err != nil {
		return "", err
	}

	return string(code), nil
}
