package acl

import (
	"errors"

	"connectrpc.com/connect"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

// targetACL represents which ACL subsystem should be involved in an operation
// using bit flags.
type targetACL uint8

const (
	// targetNone indicates no ACL systems should be involved (should not occur in practice).
	targetNone targetACL = 0
	// targetKafka indicates Kafka ACLs should be involved.
	targetKafka targetACL = 1 << iota
	// targetSR indicates Schema Registry ACLs should be involved.
	targetSR
	// targetBoth indicates both Kafka and Schema Registry ACLs should be involved.
	targetBoth = targetKafka | targetSR
)

// includesKafka returns true if Kafka ACL operations should be performed.
func (t targetACL) includesKafka() bool { return t&targetKafka != 0 }

// includesSR returns true if Schema Registry ACL operations should be performed.
func (t targetACL) includesSR() bool { return t&targetSR != 0 }

// isSROnly returns true if this is exclusively a Schema Registry operation.
func (t targetACL) isSROnly() bool { return t == targetSR }

// dispatcher handles routing logic for determining which ACL subsystem to involve.
type dispatcher struct{}

// analyzeTarget determines which ACL systems should be involved given the
// requested resource type.
func (*dispatcher) analyzeTarget(rt v1.ACL_ResourceType) targetACL {
	switch rt {
	case v1.ACL_RESOURCE_TYPE_REGISTRY, v1.ACL_RESOURCE_TYPE_SUBJECT:
		return targetSR
	case v1.ACL_RESOURCE_TYPE_ANY:
		return targetBoth
	default:
		// All other resource types are Kafka-only (TOPIC, GROUP, CLUSTER, etc.)
		return targetKafka
	}
}

// validateCapabilities checks if the required ACL systems are available and
// returns appropriate errors based on the target.
func (*dispatcher) validateCapabilities(target targetACL, isSRSupported bool) error {
	if target.isSROnly() && !isSRSupported {
		return apierrors.NewConnectError(
			connect.CodeFailedPrecondition,
			errors.New("schema registry ACLs are not supported in your cluster; please verify your schema registry configuration and ensure that your cluster has a valid license"),
			apierrors.NewErrorInfo(v1.Reason_REASON_FEATURE_NOT_CONFIGURED.String()),
		)
	}
	return nil
}
