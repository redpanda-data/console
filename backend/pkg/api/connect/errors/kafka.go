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
	"google.golang.org/genproto/googleapis/rpc/errdetails"

	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
)

// kafkaUserFriendlyMessages maps Kafka error codes to user-friendly messages
// suitable for API responses. For codes not in this map the fallback chain in
// resolveKafkaErrorMessage uses the kerr.Error.Description field.
var kafkaUserFriendlyMessages = map[int16]string{
	// Not found
	3:   "The requested topic or partition does not exist on the server.",
	57:  "The specified log directory was not found on the broker.",
	62:  "The specified delegation token was not found.",
	69:  "The specified consumer group was not found.",
	91:  "The requested resource does not exist.",
	98:  "The requested snapshot was not found.",
	100: "The requested topic ID does not exist on the server.",
	105: "The specified transactional ID was not found.",

	// Invalid argument
	4:  "The requested fetch size is invalid.",
	10: "The message exceeds the maximum size the server will accept.",
	12: "The offset metadata is too large.",
	17: "The topic name is invalid.",
	18: "The message batch exceeds the maximum size the server will accept.",
	21: "The specified required acks value is invalid.",
	24: "The specified consumer group ID is invalid.",
	26: "The session timeout is outside the allowed range configured on the broker.",
	28: "The commit offset data size is invalid.",
	32: "The message timestamp is out of the acceptable range.",
	37: "The specified number of partitions is invalid.",
	38: "The specified replication factor is invalid.",
	39: "The specified replica assignment is invalid.",
	40: "The provided configuration is invalid.",
	42: "The request is malformed or contains invalid parameters.",
	44: "The request violates a configured cluster policy.",
	49: "The producer ID does not match the transactional ID mapping.",
	50: "The transaction timeout exceeds the maximum value allowed by the broker.",
	67: "The specified principal type is not supported.",
	87: "The record failed validation on the broker and was rejected.",

	// Deadline exceeded
	7: "The request timed out before the broker could respond.",

	// Unavailable
	5:  "The partition leader is not available, likely due to an ongoing leader election.",
	6:  "This broker is not the leader for the requested partition.",
	8:  "The broker is not available.",
	14: "The coordinator is loading and cannot process requests yet.",
	15: "The group coordinator is not available.",
	16: "This broker is not the coordinator for the requested group.",
	19: "There are not enough in-sync replicas to fulfill the request.",
	20: "The message was written but to fewer in-sync replicas than required.",
	27: "The consumer group is currently rebalancing.",
	41: "This broker is not the controller for the cluster.",
	56: "A disk error occurred while trying to access the log file on the broker.",
	80: "The preferred leader is not currently available.",
	83: "No eligible leaders are currently available for the requested partition.",

	// Failed precondition
	22: "The specified generation ID is no longer valid.",
	23: "The group member's supported protocols are incompatible with the existing group.",
	25: "The coordinator does not recognize this group member.",
	45: "The broker received an out-of-order sequence number from the producer.",
	47: "The producer attempted an operation with an outdated epoch.",
	48: "The producer attempted a transactional operation in an invalid state.",
	51: "Another concurrent transaction is ongoing for this transactional ID.",
	52: "The transaction coordinator has been fenced by a newer coordinator.",
	60: "A partition reassignment is already in progress.",
	68: "The consumer group is not empty.",
	73: "Topic deletion is disabled on this cluster.",
	82: "Another consumer with the same instance ID has registered with a different member ID.",
	86: "Cannot delete offsets while the consumer group is actively subscribed to the topic.",
	90: "A newer producer with the same transactional ID has fenced this producer.",

	// Resource exhausted
	81: "The consumer group has reached its maximum allowed size.",
	89: "The throttling quota has been exceeded.",

	// Already exists
	36:  "A topic with this name already exists.",
	92:  "A resource with this identifier already exists.",
	101: "A broker with this ID is already registered.",

	// Unauthenticated
	58: "SASL authentication failed. Please verify your credentials.",

	// Aborted
	46: "The broker received a duplicate sequence number. The message was already delivered.",

	// Unimplemented
	35: "The API version is not supported by this broker.",
	43: "The operation is not supported by the message format version on the broker.",
	54: "Security features are disabled on this broker.",
	76: "The compression type is not supported by this broker.",

	// Permission denied
	29: "You do not have permission to access this topic.",
	30: "You do not have permission to access this consumer group.",
	31: "You do not have the required cluster-level permissions.",
	53: "You do not have permission to use this transactional ID.",
	65: "You do not have permission for this delegation token operation.",
}

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
			NewErrorInfo(commonv1alpha1.Reason_REASON_PERMISSION_DENIED.String()),
			newKafkaErrorInfo(code, kafkaErr),
		)
	}

	connectCode := connectCodeFromKafkaError(kafkaErr)
	errMsg := resolveKafkaErrorMessage(code, kafkaErr, msg)

	return NewConnectError(
		connectCode,
		errors.New(errMsg),
		NewErrorInfo(v1alpha2.Reason_REASON_KAFKA_API_ERROR.String()),
		newKafkaErrorInfo(code, kafkaErr),
	)
}

// connectCodeFromKafkaError maps a Kafka error to the appropriate connect.Code.
// This is a pure lookup — no message handling, no reason logic.
func connectCodeFromKafkaError(kafkaErr error) connect.Code {
	switch {
	// Already exists
	case errors.Is(kafkaErr, kerr.TopicAlreadyExists),
		errors.Is(kafkaErr, kerr.DuplicateResource),
		errors.Is(kafkaErr, kerr.DuplicateBrokerRegistration):
		return connect.CodeAlreadyExists

	// Not found
	case errors.Is(kafkaErr, kerr.UnknownTopicOrPartition),
		errors.Is(kafkaErr, kerr.UnknownTopicID),
		errors.Is(kafkaErr, kerr.GroupIDNotFound),
		errors.Is(kafkaErr, kerr.ResourceNotFound),
		errors.Is(kafkaErr, kerr.TransactionalIDNotFound),
		errors.Is(kafkaErr, kerr.DelegationTokenNotFound),
		errors.Is(kafkaErr, kerr.LogDirNotFound),
		errors.Is(kafkaErr, kerr.SnapshotNotFound):
		return connect.CodeNotFound

	// Invalid argument
	case errors.Is(kafkaErr, kerr.InvalidTopicException),
		errors.Is(kafkaErr, kerr.InvalidPartitions),
		errors.Is(kafkaErr, kerr.InvalidReplicationFactor),
		errors.Is(kafkaErr, kerr.InvalidReplicaAssignment),
		errors.Is(kafkaErr, kerr.InvalidConfig),
		errors.Is(kafkaErr, kerr.InvalidRequest),
		errors.Is(kafkaErr, kerr.PolicyViolation),
		errors.Is(kafkaErr, kerr.InvalidRequiredAcks),
		errors.Is(kafkaErr, kerr.InvalidTimestamp),
		errors.Is(kafkaErr, kerr.InvalidGroupID),
		errors.Is(kafkaErr, kerr.InvalidSessionTimeout),
		errors.Is(kafkaErr, kerr.InvalidTransactionTimeout),
		errors.Is(kafkaErr, kerr.InvalidRecord),
		errors.Is(kafkaErr, kerr.InvalidCommitOffsetSize),
		errors.Is(kafkaErr, kerr.MessageTooLarge),
		errors.Is(kafkaErr, kerr.RecordListTooLarge),
		errors.Is(kafkaErr, kerr.OffsetMetadataTooLarge),
		errors.Is(kafkaErr, kerr.InvalidFetchSize),
		errors.Is(kafkaErr, kerr.InvalidProducerIDMapping),
		errors.Is(kafkaErr, kerr.InvalidPrincipalType):
		return connect.CodeInvalidArgument

	// Deadline exceeded
	case errors.Is(kafkaErr, kerr.RequestTimedOut):
		return connect.CodeDeadlineExceeded

	// Unavailable (transient broker/leader/coordinator issues)
	case errors.Is(kafkaErr, kerr.BrokerNotAvailable),
		errors.Is(kafkaErr, kerr.LeaderNotAvailable),
		errors.Is(kafkaErr, kerr.NotController),
		errors.Is(kafkaErr, kerr.PreferredLeaderNotAvailable),
		errors.Is(kafkaErr, kerr.CoordinatorNotAvailable),
		errors.Is(kafkaErr, kerr.CoordinatorLoadInProgress),
		errors.Is(kafkaErr, kerr.NotLeaderForPartition),
		errors.Is(kafkaErr, kerr.NotCoordinator),
		errors.Is(kafkaErr, kerr.NotEnoughReplicas),
		errors.Is(kafkaErr, kerr.NotEnoughReplicasAfterAppend),
		errors.Is(kafkaErr, kerr.KafkaStorageError),
		errors.Is(kafkaErr, kerr.EligibleLeadersNotAvailable),
		errors.Is(kafkaErr, kerr.RebalanceInProgress):
		return connect.CodeUnavailable

	// Failed precondition
	case errors.Is(kafkaErr, kerr.IllegalGeneration),
		errors.Is(kafkaErr, kerr.UnknownMemberID),
		errors.Is(kafkaErr, kerr.InconsistentGroupProtocol),
		errors.Is(kafkaErr, kerr.NonEmptyGroup),
		errors.Is(kafkaErr, kerr.GroupSubscribedToTopic),
		errors.Is(kafkaErr, kerr.FencedInstanceID),
		errors.Is(kafkaErr, kerr.ProducerFenced),
		errors.Is(kafkaErr, kerr.InvalidProducerEpoch),
		errors.Is(kafkaErr, kerr.InvalidTxnState),
		errors.Is(kafkaErr, kerr.ConcurrentTransactions),
		errors.Is(kafkaErr, kerr.TransactionCoordinatorFenced),
		errors.Is(kafkaErr, kerr.OutOfOrderSequenceNumber),
		errors.Is(kafkaErr, kerr.ReassignmentInProgress),
		errors.Is(kafkaErr, kerr.TopicDeletionDisabled):
		return connect.CodeFailedPrecondition

	// Resource exhausted
	case errors.Is(kafkaErr, kerr.ThrottlingQuotaExceeded),
		errors.Is(kafkaErr, kerr.GroupMaxSizeReached):
		return connect.CodeResourceExhausted

	// Unauthenticated
	case errors.Is(kafkaErr, kerr.SaslAuthenticationFailed):
		return connect.CodeUnauthenticated

	// Aborted
	case errors.Is(kafkaErr, kerr.DuplicateSequenceNumber):
		return connect.CodeAborted

	// Unimplemented
	case errors.Is(kafkaErr, kerr.UnsupportedVersion),
		errors.Is(kafkaErr, kerr.SecurityDisabled),
		errors.Is(kafkaErr, kerr.UnsupportedForMessageFormat),
		errors.Is(kafkaErr, kerr.UnsupportedCompressionType):
		return connect.CodeUnimplemented

	default:
		return connect.CodeInternal
	}
}

// isKafkaAuthorizationError checks whether the Kafka error is an authorization error.
func isKafkaAuthorizationError(err error) bool {
	return errors.Is(err, kerr.TopicAuthorizationFailed) ||
		errors.Is(err, kerr.ClusterAuthorizationFailed) ||
		errors.Is(err, kerr.DelegationTokenAuthorizationFailed) ||
		errors.Is(err, kerr.GroupAuthorizationFailed) ||
		errors.Is(err, kerr.TransactionalIDAuthorizationFailed)
}

// resolveKafkaErrorMessage returns the appropriate user-facing error message.
// Priority: custom broker message > curated friendly message > kerr description > fallback.
func resolveKafkaErrorMessage(code int16, kafkaErr error, msg *string) string {
	if msg != nil {
		return *msg
	}
	if friendly, ok := kafkaUserFriendlyMessages[code]; ok {
		return friendly
	}
	if kafkaErr != nil {
		if kerrErr, ok := errors.AsType[*kerr.Error](kafkaErr); ok && kerrErr.Description != "" {
			return kerrErr.Description
		}
		return kafkaErr.Error()
	}
	return fmt.Sprintf("unknown kafka error with code %d", code)
}

// KeyValsFromKafkaError extracts the Kafka error code and name as key-value pairs.
// This is kept for backward compatibility with service handlers that manually
// construct errors with Kafka metadata in the primary ErrorInfo.
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

// newKafkaErrorInfo creates an ErrorInfo detail with the Kafka-specific error domain.
// This is attached as a secondary detail alongside the primary dataplane ErrorInfo,
// allowing API consumers to programmatically inspect the underlying Kafka error.
// The originalCode parameter preserves the caller's error code, since kerr.ErrorForCode
// maps unknown codes to UnknownServerError (code -1).
func newKafkaErrorInfo(originalCode int16, err error) *errdetails.ErrorInfo {
	if err == nil {
		return nil
	}

	kerrErr, ok := errors.AsType[*kerr.Error](err)
	if !ok {
		return nil
	}

	return &errdetails.ErrorInfo{
		Reason: kerrErr.Message,
		Domain: DomainDataplaneKafka,
		Metadata: map[string]string{
			"kafka_error_code":        strconv.Itoa(int(originalCode)),
			"kafka_error_description": kerrErr.Description,
			"retriable":               strconv.FormatBool(kerrErr.Retriable),
		},
	}
}
