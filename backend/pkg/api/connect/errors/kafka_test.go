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
		{name: "DuplicateResource", code: kerr.DuplicateResource.Code, expectedCode: connect.CodeAlreadyExists},
		{name: "DuplicateBrokerRegistration", code: kerr.DuplicateBrokerRegistration.Code, expectedCode: connect.CodeAlreadyExists},

		// Not found
		{name: "UnknownTopicOrPartition", code: kerr.UnknownTopicOrPartition.Code, expectedCode: connect.CodeNotFound},
		{name: "UnknownTopicID", code: kerr.UnknownTopicID.Code, expectedCode: connect.CodeNotFound},
		{name: "GroupIDNotFound", code: kerr.GroupIDNotFound.Code, expectedCode: connect.CodeNotFound},
		{name: "ResourceNotFound", code: kerr.ResourceNotFound.Code, expectedCode: connect.CodeNotFound},
		{name: "TransactionalIDNotFound", code: kerr.TransactionalIDNotFound.Code, expectedCode: connect.CodeNotFound},
		{name: "DelegationTokenNotFound", code: kerr.DelegationTokenNotFound.Code, expectedCode: connect.CodeNotFound},
		{name: "LogDirNotFound", code: kerr.LogDirNotFound.Code, expectedCode: connect.CodeNotFound},
		{name: "SnapshotNotFound", code: kerr.SnapshotNotFound.Code, expectedCode: connect.CodeNotFound},
		// UnknownProducerID (59) is intentionally NOT mapped — it refers to expired internal
		// producer state (retention elapsed), not a user-visible resource. Falls to CodeInternal.

		// Invalid argument
		{name: "InvalidTopicException", code: kerr.InvalidTopicException.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidPartitions", code: kerr.InvalidPartitions.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidReplicationFactor", code: kerr.InvalidReplicationFactor.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidReplicaAssignment", code: kerr.InvalidReplicaAssignment.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidConfig", code: kerr.InvalidConfig.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidRequest", code: kerr.InvalidRequest.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "PolicyViolation", code: kerr.PolicyViolation.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidRequiredAcks", code: kerr.InvalidRequiredAcks.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidTimestamp", code: kerr.InvalidTimestamp.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidGroupID", code: kerr.InvalidGroupID.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidSessionTimeout", code: kerr.InvalidSessionTimeout.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidTransactionTimeout", code: kerr.InvalidTransactionTimeout.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidRecord", code: kerr.InvalidRecord.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidCommitOffsetSize", code: kerr.InvalidCommitOffsetSize.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "MessageTooLarge", code: kerr.MessageTooLarge.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "RecordListTooLarge", code: kerr.RecordListTooLarge.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "OffsetMetadataTooLarge", code: kerr.OffsetMetadataTooLarge.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidFetchSize", code: kerr.InvalidFetchSize.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidProducerIDMapping", code: kerr.InvalidProducerIDMapping.Code, expectedCode: connect.CodeInvalidArgument},
		{name: "InvalidPrincipalType", code: kerr.InvalidPrincipalType.Code, expectedCode: connect.CodeInvalidArgument},

		// Deadline exceeded
		{name: "RequestTimedOut", code: kerr.RequestTimedOut.Code, expectedCode: connect.CodeDeadlineExceeded},

		// Unavailable (transient broker/leader/coordinator issues)
		{name: "BrokerNotAvailable", code: kerr.BrokerNotAvailable.Code, expectedCode: connect.CodeUnavailable},
		{name: "LeaderNotAvailable", code: kerr.LeaderNotAvailable.Code, expectedCode: connect.CodeUnavailable},
		{name: "NotController", code: kerr.NotController.Code, expectedCode: connect.CodeUnavailable},
		{name: "PreferredLeaderNotAvailable", code: kerr.PreferredLeaderNotAvailable.Code, expectedCode: connect.CodeUnavailable},
		{name: "CoordinatorNotAvailable", code: kerr.CoordinatorNotAvailable.Code, expectedCode: connect.CodeUnavailable},
		{name: "CoordinatorLoadInProgress", code: kerr.CoordinatorLoadInProgress.Code, expectedCode: connect.CodeUnavailable},
		{name: "NotLeaderForPartition", code: kerr.NotLeaderForPartition.Code, expectedCode: connect.CodeUnavailable},
		{name: "NotCoordinator", code: kerr.NotCoordinator.Code, expectedCode: connect.CodeUnavailable},
		{name: "NotEnoughReplicas", code: kerr.NotEnoughReplicas.Code, expectedCode: connect.CodeUnavailable},
		{name: "NotEnoughReplicasAfterAppend", code: kerr.NotEnoughReplicasAfterAppend.Code, expectedCode: connect.CodeUnavailable},
		{name: "KafkaStorageError", code: kerr.KafkaStorageError.Code, expectedCode: connect.CodeUnavailable},
		{name: "EligibleLeadersNotAvailable", code: kerr.EligibleLeadersNotAvailable.Code, expectedCode: connect.CodeUnavailable},
		{name: "RebalanceInProgress", code: kerr.RebalanceInProgress.Code, expectedCode: connect.CodeUnavailable},

		// Failed precondition
		{name: "IllegalGeneration", code: kerr.IllegalGeneration.Code, expectedCode: connect.CodeFailedPrecondition},
		{name: "UnknownMemberID", code: kerr.UnknownMemberID.Code, expectedCode: connect.CodeFailedPrecondition},
		{name: "InconsistentGroupProtocol", code: kerr.InconsistentGroupProtocol.Code, expectedCode: connect.CodeFailedPrecondition},
		{name: "NonEmptyGroup", code: kerr.NonEmptyGroup.Code, expectedCode: connect.CodeFailedPrecondition},
		{name: "GroupSubscribedToTopic", code: kerr.GroupSubscribedToTopic.Code, expectedCode: connect.CodeFailedPrecondition},
		{name: "FencedInstanceID", code: kerr.FencedInstanceID.Code, expectedCode: connect.CodeFailedPrecondition},
		{name: "ProducerFenced", code: kerr.ProducerFenced.Code, expectedCode: connect.CodeFailedPrecondition},
		{name: "InvalidProducerEpoch", code: kerr.InvalidProducerEpoch.Code, expectedCode: connect.CodeFailedPrecondition},
		{name: "InvalidTxnState", code: kerr.InvalidTxnState.Code, expectedCode: connect.CodeFailedPrecondition},
		{name: "ConcurrentTransactions", code: kerr.ConcurrentTransactions.Code, expectedCode: connect.CodeFailedPrecondition},
		{name: "TransactionCoordinatorFenced", code: kerr.TransactionCoordinatorFenced.Code, expectedCode: connect.CodeFailedPrecondition},
		{name: "OutOfOrderSequenceNumber", code: kerr.OutOfOrderSequenceNumber.Code, expectedCode: connect.CodeFailedPrecondition},
		{name: "ReassignmentInProgress", code: kerr.ReassignmentInProgress.Code, expectedCode: connect.CodeFailedPrecondition},
		{name: "TopicDeletionDisabled", code: kerr.TopicDeletionDisabled.Code, expectedCode: connect.CodeFailedPrecondition},

		// Resource exhausted
		{name: "ThrottlingQuotaExceeded", code: kerr.ThrottlingQuotaExceeded.Code, expectedCode: connect.CodeResourceExhausted},
		{name: "GroupMaxSizeReached", code: kerr.GroupMaxSizeReached.Code, expectedCode: connect.CodeResourceExhausted},

		// Unauthenticated
		{name: "SaslAuthenticationFailed", code: kerr.SaslAuthenticationFailed.Code, expectedCode: connect.CodeUnauthenticated},

		// Aborted
		{name: "DuplicateSequenceNumber", code: kerr.DuplicateSequenceNumber.Code, expectedCode: connect.CodeAborted},

		// Unimplemented
		{name: "UnsupportedVersion", code: kerr.UnsupportedVersion.Code, expectedCode: connect.CodeUnimplemented},
		{name: "SecurityDisabled", code: kerr.SecurityDisabled.Code, expectedCode: connect.CodeUnimplemented},
		{name: "UnsupportedForMessageFormat", code: kerr.UnsupportedForMessageFormat.Code, expectedCode: connect.CodeUnimplemented},
		{name: "UnsupportedCompressionType", code: kerr.UnsupportedCompressionType.Code, expectedCode: connect.CodeUnimplemented},

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

			// Verify error details are present.
			details := connectErr.Details()
			assert.NotEmpty(t, details, "expected error details to be present")

			// Find the primary (dataplane) and secondary (kafka) ErrorInfo details.
			var primaryInfo, kafkaInfo *errdetails.ErrorInfo
			for _, detail := range details {
				val, err := detail.Value()
				require.NoError(t, err)
				if ei, ok := val.(*errdetails.ErrorInfo); ok {
					switch ei.Domain {
					case DomainDataplane:
						primaryInfo = ei
					case DomainDataplaneKafka:
						kafkaInfo = ei
					}
				}
			}

			// Primary ErrorInfo should always be present with no Kafka-specific metadata.
			require.NotNil(t, primaryInfo, "expected a primary ErrorInfo detail (domain: %s)", DomainDataplane)
			assert.NotContains(t, primaryInfo.Metadata, "kafka_error_code", "primary ErrorInfo should not contain kafka metadata")

			// Auth errors should use REASON_PERMISSION_DENIED; others should use REASON_KAFKA_API_ERROR.
			if tc.expectedCode == connect.CodePermissionDenied {
				assert.Equal(t, "REASON_PERMISSION_DENIED", primaryInfo.Reason)
			} else {
				assert.Equal(t, "REASON_KAFKA_API_ERROR", primaryInfo.Reason)
			}

			// Secondary Kafka ErrorInfo should be present for known codes.
			if tc.code != 999 {
				require.NotNil(t, kafkaInfo, "expected a Kafka ErrorInfo detail (domain: %s)", DomainDataplaneKafka)
				assert.Contains(t, kafkaInfo.Metadata, "kafka_error_code")
				assert.Contains(t, kafkaInfo.Metadata, "kafka_error_description")
				assert.Contains(t, kafkaInfo.Metadata, "retriable")
				assert.NotEmpty(t, kafkaInfo.Reason, "kafka ErrorInfo reason should be the error name")
			}

			// Verify user-friendly message is used when available.
			if friendly, ok := kafkaUserFriendlyMessages[tc.code]; ok {
				assert.Equal(t, friendly, connectErr.Message(), "expected user-friendly message for code %d", tc.code)
			}
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
	assert.Equal(t, "broker-provided error detail", connectErr.Message(), "custom message should take priority")
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

func TestResolveKafkaErrorMessage(t *testing.T) {
	t.Parallel()

	t.Run("custom message takes priority", func(t *testing.T) {
		t.Parallel()
		custom := "custom broker message"
		msg := resolveKafkaErrorMessage(kerr.UnknownTopicOrPartition.Code, kerr.UnknownTopicOrPartition, &custom)
		assert.Equal(t, "custom broker message", msg)
	})

	t.Run("friendly message used when no custom message", func(t *testing.T) {
		t.Parallel()
		msg := resolveKafkaErrorMessage(kerr.UnknownTopicOrPartition.Code, kerr.UnknownTopicOrPartition, nil)
		expected := kafkaUserFriendlyMessages[kerr.UnknownTopicOrPartition.Code]
		assert.Equal(t, expected, msg)
	})

	t.Run("kerr Description used for unmapped codes", func(t *testing.T) {
		t.Parallel()
		// Use an error code that exists in kerr but is not in our friendly map.
		// Code -1 (UnknownServerError) is a good candidate.
		unmappedErr := kerr.UnknownServerError
		_, inMap := kafkaUserFriendlyMessages[unmappedErr.Code]
		require.False(t, inMap, "test requires error code %d to NOT be in kafkaUserFriendlyMessages", unmappedErr.Code)

		msg := resolveKafkaErrorMessage(unmappedErr.Code, unmappedErr, nil)
		assert.Equal(t, unmappedErr.Description, msg)
	})

	t.Run("fallback for nil error", func(t *testing.T) {
		t.Parallel()
		msg := resolveKafkaErrorMessage(999, nil, nil)
		assert.Equal(t, "unknown kafka error with code 999", msg)
	})
}

func TestNewKafkaErrorInfo(t *testing.T) {
	t.Parallel()

	t.Run("creates ErrorInfo for kerr.Error", func(t *testing.T) {
		t.Parallel()
		info := newKafkaErrorInfo(kerr.UnknownTopicOrPartition.Code, kerr.UnknownTopicOrPartition)
		require.NotNil(t, info)

		assert.Equal(t, DomainDataplaneKafka, info.Domain)
		assert.Equal(t, "UNKNOWN_TOPIC_OR_PARTITION", info.Reason)
		assert.Equal(t, "3", info.Metadata["kafka_error_code"])
		assert.Equal(t, kerr.UnknownTopicOrPartition.Description, info.Metadata["kafka_error_description"])
		assert.Equal(t, "true", info.Metadata["retriable"])
	})

	t.Run("non-retriable error", func(t *testing.T) {
		t.Parallel()
		info := newKafkaErrorInfo(kerr.TopicAlreadyExists.Code, kerr.TopicAlreadyExists)
		require.NotNil(t, info)
		assert.Equal(t, "false", info.Metadata["retriable"])
	})

	t.Run("preserves original code for unknown codes", func(t *testing.T) {
		t.Parallel()
		unknownErr := kerr.ErrorForCode(999)
		info := newKafkaErrorInfo(999, unknownErr)
		require.NotNil(t, info)
		assert.Equal(t, "999", info.Metadata["kafka_error_code"], "should preserve original code, not the mapped -1")
	})

	t.Run("returns nil for nil error", func(t *testing.T) {
		t.Parallel()
		assert.Nil(t, newKafkaErrorInfo(0, nil))
	})

	t.Run("returns nil for non-kerr error", func(t *testing.T) {
		t.Parallel()
		assert.Nil(t, newKafkaErrorInfo(0, errors.New("transport error")))
	})
}

func TestKafkaUserFriendlyMessages_AllCodesValid(t *testing.T) {
	t.Parallel()
	for code := range kafkaUserFriendlyMessages {
		kerrErr := kerr.ErrorForCode(code)
		require.NotNil(t, kerrErr, "code %d in kafkaUserFriendlyMessages has no corresponding kerr error", code)
		// ErrorForCode returns UnknownServerError for unrecognized codes.
		// If we get that back for a code other than -1, the code is invalid.
		if code != -1 {
			assert.NotErrorIs(t, kerrErr, kerr.UnknownServerError,
				"code %d in kafkaUserFriendlyMessages maps to UnknownServerError — the code may not exist in this version of franz-go", code)
		}
	}
}
