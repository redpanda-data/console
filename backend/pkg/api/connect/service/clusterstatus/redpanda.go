// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package clusterstatus

import (
	"strings"

	"github.com/redpanda-data/common-go/rpadmin"

	consolev1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
)

type redpandaStatusChecker struct{}

// clusterVersionFromBrokerList returns the version of the Redpanda cluster. Since each broker
// reports the version individually, we iterate through the list of brokers and
// return the first reported version that contains a semVer.
func (*redpandaStatusChecker) clusterVersionFromBrokerList(brokers []rpadmin.Broker) string {
	version := unknownVersion
	for _, broker := range brokers {
		if broker.Version != "" {
			// Broker version may look like this: "v22.1.4 - 491e56900d2316fcbb22aa1d37e7195897878309"
			brokerVersion := strings.Split(broker.Version, " ")
			if len(brokerVersion) > 0 {
				version = "Redpanda " + brokerVersion[0]
				break
			}
		}
	}
	return version
}

// partitionBalancerViolationsToProto maps a PartitionBalancerViolations Go type to its proto representation.
func (*redpandaStatusChecker) partitionBalancerViolationsToProto(in rpadmin.PartitionBalancerViolations) *consolev1alpha1.GetRedpandaPartitionBalancerStatusResponse_Violations {
	return &consolev1alpha1.GetRedpandaPartitionBalancerStatusResponse_Violations{
		UnavailableNodes:   intSliceToInt32Slice(in.UnavailableNodes),
		OverDiskLimitNodes: intSliceToInt32Slice(in.OverDiskLimitNodes),
	}
}

// partitionBalancerStatusToProto maps a PartitionBalancerStatus Go type to its proto representation.
func (r *redpandaStatusChecker) partitionBalancerStatusToProto(in *rpadmin.PartitionBalancerStatus) *consolev1alpha1.GetRedpandaPartitionBalancerStatusResponse {
	if in == nil {
		return nil
	}

	out := &consolev1alpha1.GetRedpandaPartitionBalancerStatusResponse{
		Status:                        r.balancerStatusStringToProtoEnum(in.Status),
		Violations:                    r.partitionBalancerViolationsToProto(in.Violations),
		SecondsSinceLastTick:          int32(in.SecondsSinceLastTick),
		CurrentReassignmentsCount:     int32(in.CurrentReassignmentsCount),
		PartitionsPendingRecoveryList: in.PartitionsPendingRecoveryList,
	}

	if in.PartitionsPendingForceRecovery != nil {
		v := int32(*in.PartitionsPendingForceRecovery)
		out.PartitionsPendingForceRecoveryCount = &v
	}

	return out
}

// balancerStatusStringToProtoEnum converts the status string from the Go type to the proto enum.
func (*redpandaStatusChecker) balancerStatusStringToProtoEnum(status string) consolev1alpha1.GetRedpandaPartitionBalancerStatusResponse_Status {
	switch status {
	case "off":
		return consolev1alpha1.GetRedpandaPartitionBalancerStatusResponse_STATUS_OFF
	case "ready":
		return consolev1alpha1.GetRedpandaPartitionBalancerStatusResponse_STATUS_READY
	case "starting":
		return consolev1alpha1.GetRedpandaPartitionBalancerStatusResponse_STATUS_STARTING
	case "in_progress":
		return consolev1alpha1.GetRedpandaPartitionBalancerStatusResponse_STATUS_IN_PROGRESS
	case "stalled":
		return consolev1alpha1.GetRedpandaPartitionBalancerStatusResponse_STATUS_STALLED
	default:
		return consolev1alpha1.GetRedpandaPartitionBalancerStatusResponse_STATUS_UNSPECIFIED
	}
}
