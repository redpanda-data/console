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

	"github.com/redpanda-data/redpanda/src/go/rpk/pkg/adminapi"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

//nolint:stylecheck // generated enum
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

func adminMetadataToProtoMetadata(transforms []adminapi.TransformMetadata) ([]*v1alpha1.TransformMetadata, error) {
	apiTransforms := make([]*v1alpha1.TransformMetadata, 0, len(transforms))
	for _, transform := range transforms {
		stat, err := adminStatusToProtoStatus(transform)
		if err != nil {
			return nil, fmt.Errorf("unable to convert transform status: %w", err)
		}
		apiTransforms = append(apiTransforms, &v1alpha1.TransformMetadata{
			Name:             transform.Name,
			InputTopicName:   transform.InputTopic,
			OutputTopicNames: transform.OutputTopics,
			Status:           stat,
		})
	}
	return apiTransforms, nil
}

func adminStatusToProtoStatus(transform adminapi.TransformMetadata) ([]*v1alpha1.PartitionTransformStatus, error) {
	pts := make([]*v1alpha1.PartitionTransformStatus, 0, len(transform.Status))
	for _, ts := range transform.Status {
		st, err := statusToPartitionTransformStatus_PartitionStatus(ts.Status)
		if err != nil {
			return nil, err
		}
		pts = append(pts, &v1alpha1.PartitionTransformStatus{
			NodeId:    int32(ts.NodeID),
			Status:    st,
			Lag:       int32(ts.Lag),
			Partition: int32(ts.Partition),
		})
	}
	return pts, nil
}
