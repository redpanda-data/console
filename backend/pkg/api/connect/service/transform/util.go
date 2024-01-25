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

	"connectrpc.com/connect"
	"github.com/redpanda-data/redpanda/src/go/rpk/pkg/adminapi"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	commonv1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/common/v1alpha1"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

func findTransformByName(transforms []*v1alpha1.TransformMetadata, name string) (*v1alpha1.TransformMetadata, error) {
	for _, transform := range transforms {
		if transform.Name == name {
			return transform, nil
		}
	}
	return nil, apierrors.NewConnectError(
		connect.CodeNotFound,
		fmt.Errorf("the requested transform does not exist"),
		apierrors.NewErrorInfo(
			commonv1alpha1.Reason_REASON_RESOURCE_NOT_FOUND.String(),
		))
}

func transformsConversion(transforms []adminapi.TransformMetadata) ([]*v1alpha1.TransformMetadata, error) {
	apiTransforms := make([]*v1alpha1.TransformMetadata, 0, len(transforms))
	for _, transform := range transforms {
		stat, err := statusConversion(transform)
		if err != nil {
			return nil, err
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

func statusConversion(transform adminapi.TransformMetadata) ([]*v1alpha1.PartitionTransformStatus, error) {
	pts := make([]*v1alpha1.PartitionTransformStatus, 0, len(transform.Status))
	for _, ts := range transform.Status {
		st, err := statusToPartitionTransformStatus_PartitionStatus(ts.Status)
		if err != nil {
			return nil, apierrors.NewConnectError(
				connect.CodeInternal,
				err,
				apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
			)
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
