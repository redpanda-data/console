// Copyright 2025 Redpanda Data, Inc.
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
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kerr"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
)

func TestNewConnectErrorFromKafkaErrorCode(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name         string
		code         int16
		expectedCode connect.Code
	}{
		// Already exists
		{name: "TopicAlreadyExists", code: kerr.TopicAlreadyExists.Code, expectedCode: connect.CodeAlreadyExists},

		// Not found
		{name: "UnknownTopicOrPartition", code: kerr.UnknownTopicOrPartition.Code, expectedCode: connect.CodeNotFound},
		{name: "UnknownTopicID", code: kerr.UnknownTopicID.Code, expectedCode: connect.CodeNotFound},

		// Invalid argument
		{name: "InvalidTopicException", code: kerr.InvalidTopicException.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidPartitions", code: kerr.InvalidPartitions.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidReplicationFactor", code: kerr.InvalidReplicationFactor.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidReplicaAssignment", code: kerr.InvalidReplicaAssignment.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidConfig", code: kerr.InvalidConfig.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidRequest", code: kerr.InvalidRequest.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "PolicyViolation", code: kerr.PolicyViolation.Code, expectedCode: connect.CodeInvalidArgument},

		// Deadline exceeded (retriable timeout)
		{name: "RequestTimedOut", code: kerr.RequestTimedOut.Code, expectedCode: connect.CodeDeadlineExceeded},

		// Unavailable (transient broker/leader issues — all retriable)
		{name: "BrokerNotAvailable", code: kerr.BrokerNotAvailable.Code, expectedCode: connect.CodeUnavailable},
		{name: "LeaderNotAvailable", code: kerr.LeaderNotAvailable.Code, expectedCode: connect.CodeUnavailable},
		{name: "NotController", code: kerr.NotController.Code, expectedCode: connect.CodeUnavailable},
		{name: "PreferredLeaderNotAvailable", code: kerr.PreferredLeaderNotAvailable.Code, expectedCode: connect.CodeUnavailable},

		// Unimplemented
		{name: "UnsupportedVersion", code: kerr.UnsupportedVersion.Code, expectedCode: connect.CodeUnimplemented},
		{name: "SecurityDisabled", code: kerr.SecurityDisabled.Code, expectedCode: connect.CodeUnimplemented},

		// Permission denied (auth errors)
		{name: "TopicAuthorizationFailed", code: kerr.TopicAuthorizationFailed.Code, expectedCode: connect.CodePermissionDenied},
		{name: "ClusterAuthorizationFailed", code: kerr.ClusterAuthorizationFailed.Code, expectedCode: connect.CodePermissionDenied},
		{name: "GroupAuthorizationFailed", code: kerr.GroupAuthorizationFailed.Code, expectedCode: connect.CodePermissionDenied},
		{name: "TransactionalIDAuthorizationFailed", code: kerr.TransactionalIDAuthorizationFailed.Code, expectedCode: connect.CodePermissionDenied},
		{name: "DelegationTokenAuthorizationFailed", code: kerr.DelegationTokenAuthorizationFailed.Code, expectedCode: connect.CodePermissionDenied},

		// Internal fallback for unknown codes
		{name: "UnknownCode999", code: 999, expectedCode: connect.CodeInternal},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			connectErr := NewConnectErrorFromKafkaErrorCode(tc.code, nil)
			require.NotNil(t, connectErr)
			assert.Equal(t, tc.expectedCode, connectErr.Code(), "wrong connect code for kafka error code %d", tc.code)

			details := connectErr.Details()
			assert.NotEmpty(t, details, "expected error details to be present")

			var errorInfo *errdetails.ErrorInfo
			for _, detail := range details {
				val, err := detail.Value()
				require.NoError(t, err)
				if ei, ok := val.(*errdetails.ErrorInfo); ok {
					errorInfo = ei
					break
				}
			}
			require.NotNil(t, errorInfo, "expected an ErrorInfo detail")

			// Verify metadata contains kafka error info. For known codes the
			// metadata kafka_error_code matches the input; for unknown codes
			// kerr.ErrorForCode returns UnknownServerError (code -1).
			assert.Contains(t, errorInfo.Metadata, "kafka_error_code")
			assert.Contains(t, errorInfo.Metadata, "kafka_error_message")
		})
	}
}

func TestNewConnectErrorFromKafkaErrorCode_CodeZero(t *testing.T) {
	t.Parallel()
	assert.Nil(t, NewConnectErrorFromKafkaErrorCode(0, nil))
}

func TestNewConnectErrorFromKafkaErrorCode_CustomMsg(t *testing.T) {
	t.Parallel()
	customMsg := "broker-provided error detail"
	connectErr := NewConnectErrorFromKafkaErrorCode(kerr.InvalidConfig.Code, &customMsg)
	require.NotNil(t, connectErr)
	assert.Equal(t, connect.CodeInvalidArgument, connectErr.Code())
	assert.Equal(t, "broker-provided error detail", connectErr.Message())
}

func TestNewConnectErrorFromKafkaError(t *testing.T) {
	t.Parallel()

	t.Run("wrapped kerr.Error delegates to code mapping", func(t *testing.T) {
		t.Parallel()
		wrapped := fmt.Errorf("outer: %w", kerr.TopicAlreadyExists)
		connectErr := NewConnectErrorFromKafkaError(wrapped)
		require.NotNil(t, connectErr)
		assert.Equal(t, connect.CodeAlreadyExists, connectErr.Code())
	})

	t.Run("plain transport error returns CodeInternal", func(t *testing.T) {
		t.Parallel()
		connectErr := NewConnectErrorFromKafkaError(errors.New("connection refused"))
		require.NotNil(t, connectErr)
		assert.Equal(t, connect.CodeInternal, connectErr.Code())
	})
}
