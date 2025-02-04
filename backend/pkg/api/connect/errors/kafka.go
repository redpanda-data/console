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
	"fmt"
	"strconv"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"connectrpc.com/connect"
	"github.com/twmb/franz-go/pkg/kerr"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

// NewConnectErrorFromKafkaErrorCode creates a new connect.Error for a given Kafka error code.
// Kafka error codes are described in the franz-go kerr package.
func NewConnectErrorFromKafkaErrorCode(code int16, msg *string) *connect.Error {
	if code == 0 {
		return nil
	}

	kafkaErr := kerr.ErrorForCode(code)
	errMsg := resolveKafkaErrorMessage(code, kafkaErr, msg)

	if isKafkaAuthorizationError(kafkaErr) {
		return NewConnectError(
			connect.CodePermissionDenied,
			errors.New("you are not authorized to call this endpoint"),
			NewErrorInfo(
				commonv1alpha1.Reason_REASON_PERMISSION_DENIED.String(),
				KeyValsFromKafkaError(kafkaErr)...,
			),
		)
	}

	return NewConnectError(
		connect.CodeInternal,
		errors.New(errMsg),
		NewErrorInfo(v1alpha1.Reason_REASON_KAFKA_API_ERROR.String(), KeyValsFromKafkaError(kafkaErr)...),
	)
}

// isAuthorizationError checks whether the Kafka error is an authorization error.
func isKafkaAuthorizationError(err error) bool {
	return errors.Is(err, kerr.TopicAuthorizationFailed) ||
		errors.Is(err, kerr.ClusterAuthorizationFailed) ||
		errors.Is(err, kerr.DelegationTokenAuthorizationFailed) ||
		errors.Is(err, kerr.GroupAuthorizationFailed) ||
		errors.Is(err, kerr.TransactionalIDAuthorizationFailed)
}

// resolveKafkaErrorMessage returns the appropriate error message.
func resolveKafkaErrorMessage(code int16, kafkaErr error, msg *string) string {
	if msg != nil {
		return *msg
	}
	if kafkaErr != nil {
		return kafkaErr.Error()
	}
	return fmt.Sprintf("unknown kafka error with code %q", code)
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
