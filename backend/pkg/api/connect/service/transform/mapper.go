// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package transform

import (
	"fmt"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

func statusToPartitionTransformStatus_PartitionStatus(s string) (v1alpha1.PartitionTransformStatus_PartitionStatus, error) {
	switch s {
	case "unspecified":
		return v1alpha1.PartitionTransformStatus_PARTITION_STATUS_UNSPECIFIED, nil
	case "running":
		return v1alpha1.PartitionTransformStatus_PARTITION_STATUS_RUNNING, nil
	case "inactive":
		return v1alpha1.PartitionTransformStatus_PARTITION_STATUS_INACTIVE, nil
	case "errored":
		return v1alpha1.PartitionTransformStatus_PARTITION_STATUS_ERRORED, nil
	case "unknown":
		return v1alpha1.PartitionTransformStatus_PARTITION_STATUS_UNKNOWN, nil
	default:
		return -1, fmt.Errorf("unable to convert %q to a known string that can be handled by the Redpanda Admin API", s)
	}
}
