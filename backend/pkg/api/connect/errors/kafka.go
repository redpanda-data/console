// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package errors

import (
	"errors"
	"strconv"

	"connectrpc.com/connect"
	"github.com/twmb/franz-go/pkg/kerr"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

// NewConnectErrorFromKafkaErrorCode creates a new connect.Error for a given Kafka error code.
// Kafka error codes are described in the franz-go kerr package.
func NewConnectErrorFromKafkaErrorCode(code int16, msg *string) *connect.Error {
	kafkaErr := kerr.ErrorForCode(code)

	errMsg := kafkaErr.Error()
	if msg != nil {
		errMsg = *msg
	}
	return NewConnectError(
		connect.CodeInternal,
		errors.New(errMsg),
		NewErrorInfo(v1alpha1.Reason_REASON_KAFKA_API_ERROR.String(), KeyValsFromKafkaError(kafkaErr)...),
	)
}

// KeyValsFromKafkaError tries to check if a given error is a Kafka error.
// If this is the case, this function extracts the Kafka error code (int16)
// as well as the string enum of this error code and returns a Key-Value
// pair for each. These Key-Value pairs can be attached to the connect errors.
func KeyValsFromKafkaError(err error) []KeyVal {
	if err == nil {
		return []KeyVal{}
	}

	var kafkaErr *kerr.Error
	if errors.As(err, &kafkaErr) {
		return []KeyVal{
			{
				Key:   "kafka_error_code",
				Value: strconv.Itoa(int(kafkaErr.Code)),
			},
			{
				Key:   "kafka_error_message",
				Value: kafkaErr.Message,
			},
		}
	}

	return []KeyVal{}
}
