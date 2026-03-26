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

	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
)

// NewConnectErrorFromKafkaError creates a connect.Error from a Kafka error.
// If the error is a *kerr.Error it delegates to NewConnectErrorFromKafkaErrorCode;
// otherwise it wraps the error as CodeInternal (e.g. transport/connection failures).
func NewConnectErrorFromKafkaError(err error) *connect.Error {
	if kafkaErr, ok := errors.AsType[*kerr.Error](err); ok {
		return NewConnectErrorFromKafkaErrorCode(kafkaErr.Code, nil)
	}
	return NewConnectError(
		connect.CodeInternal,
		err,
		NewErrorInfo(v1alpha2.Reason_REASON_KAFKA_API_ERROR.String()),
	)
}

// NewConnectErrorFromKafkaErrorCode creates a new connect.Error for a given Kafka error code.
// Kafka error codes are described in the franz-go kerr package.
func NewConnectErrorFromKafkaErrorCode(code int16, msg *string) *connect.Error {
	if code == 0 {
		return nil
	}

	kafkaErr := kerr.ErrorForCode(code)

	// Auth errors use a distinct reason; short-circuit before the general path.
	if isKafkaAuthorizationError(kafkaErr) {
		return NewConnectError(
			connect.CodePermissionDenied,
			errors.New(resolveKafkaErrorMessage(code, kafkaErr, msg)),
			NewErrorInfo(commonv1alpha1.Reason_REASON_PERMISSION_DENIED.String(), KeyValsFromKafkaError(kafkaErr)...),
		)
	}

	return NewConnectError(
		connectCode,
		errors.New(errMsg),
		NewErrorInfo(v1alpha2.Reason_REASON_KAFKA_API_ERROR.String(), KeyValsFromKafkaError(kafkaErr)...),
	)
}

// connectCodeFromKafkaError maps a Kafka error to the appropriate connect.Code.
// This is a pure lookup — no message handling, no reason logic.
func connectCodeFromKafkaError(kafkaErr error) connect.Code {
	switch {
	case errors.Is(kafkaErr, kerr.TopicAlreadyExists):
		return connect.CodeAlreadyExists

	case errors.Is(kafkaErr, kerr.UnknownTopicOrPartition),
		errors.Is(kafkaErr, kerr.UnknownTopicID):
		return connect.CodeNotFound

	case errors.Is(kafkaErr, kerr.InvalidTopicException),
		errors.Is(kafkaErr, kerr.InvalidPartitions),
		errors.Is(kafkaErr, kerr.InvalidReplicationFactor),
		errors.Is(kafkaErr, kerr.InvalidReplicaAssignment),
		errors.Is(kafkaErr, kerr.InvalidConfig),
		errors.Is(kafkaErr, kerr.InvalidRequest),
		errors.Is(kafkaErr, kerr.PolicyViolation):
		return connect.CodeInvalidArgument

	case errors.Is(kafkaErr, kerr.RequestTimedOut):
		return connect.CodeDeadlineExceeded

	case errors.Is(kafkaErr, kerr.BrokerNotAvailable),
		errors.Is(kafkaErr, kerr.LeaderNotAvailable),
		errors.Is(kafkaErr, kerr.NotController),
		errors.Is(kafkaErr, kerr.PreferredLeaderNotAvailable):
		return connect.CodeUnavailable

	case errors.Is(kafkaErr, kerr.UnsupportedVersion),
		errors.Is(kafkaErr, kerr.SecurityDisabled):
		return connect.CodeUnimplemented

	default:
		return connect.CodeInternal
	}
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
	return fmt.Sprintf("unknown kafka error with code %d", code)
}

// KeyValsFromKafkaError tries to check if a given error is a Kafka error.
// If this is the case, this function extracts the Kafka error code (int16)
// as well as the string enum of this error code and returns a Key-Value
// pair for each. These Key-Value pairs can be attached to the connect errors.
func KeyValsFromKafkaError(err error) []KeyVal {
	if err == nil {
		return []KeyVal{}
	}

	if kafkaErr, ok := errors.AsType[*kerr.Error](err); ok {
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
