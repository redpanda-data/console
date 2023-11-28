// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package connect

import (
	"errors"

	con "github.com/cloudhut/connect-client"
)

// ErrKafkaConnectNotConfigured indicates that Kafka connect was not configured in Console.
var ErrKafkaConnectNotConfigured = errors.New("kafka connect not configured")

// GetStatusCodeFromAPIError tries to parse given error as kafa connect
// ApiError and returns the status code, if parsing is not possible it returns
// a fallback error code
func GetStatusCodeFromAPIError(err error, fallback int) int {
	// Check if the error is an APIError from Kafka Connect
	var apiErr con.ApiError

	if errors.As(err, &apiErr) {
		if apiErr.ErrorCode >= 400 && apiErr.ErrorCode <= 599 {
			return apiErr.ErrorCode
		}
	}
	return fallback
}
