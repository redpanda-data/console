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
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
)

type mapper struct{}

func (*mapper) v1alpha1ToListTransformsv1alpha2(m *v1alpha1.ListTransformsRequest) *v1alpha2.ListTransformsRequest {
	var filter *v1alpha2.ListTransformsRequest_Filter
	if m.Filter != nil {
		filter = &v1alpha2.ListTransformsRequest_Filter{
			NameContains: m.GetFilter().GetNameContains(),
		}
	}

	return &v1alpha2.ListTransformsRequest{
		Filter:    filter,
		PageToken: m.GetPageToken(),
		PageSize:  m.GetPageSize(),
	}
}

func v1alpha2TransformStatusToV1alpha1(t v1alpha2.PartitionTransformStatus_PartitionStatus) v1alpha1.PartitionTransformStatus_PartitionStatus {
	switch t {
	case v1alpha2.PartitionTransformStatus_PARTITION_STATUS_RUNNING:
		return v1alpha1.PartitionTransformStatus_PARTITION_STATUS_RUNNING
	case v1alpha2.PartitionTransformStatus_PARTITION_STATUS_INACTIVE:
		return v1alpha1.PartitionTransformStatus_PARTITION_STATUS_INACTIVE
	case v1alpha2.PartitionTransformStatus_PARTITION_STATUS_ERRORED:
		return v1alpha1.PartitionTransformStatus_PARTITION_STATUS_ERRORED
	case v1alpha2.PartitionTransformStatus_PARTITION_STATUS_UNKNOWN:
		return v1alpha1.PartitionTransformStatus_PARTITION_STATUS_UNKNOWN
	default:
		return v1alpha1.PartitionTransformStatus_PARTITION_STATUS_UNSPECIFIED
	}
}

func (m *mapper) v1alpha2TransformsToV1alpha1(transforms []*v1alpha2.TransformMetadata) []*v1alpha1.TransformMetadata {
	out := make([]*v1alpha1.TransformMetadata, 0, len(transforms))

	for _, t := range transforms {
		out = append(out, m.v1alpha2TransformMetadataToV1alpha1(t))
	}
	return out
}

func (*mapper) v1alpha1ToGetTransformv1alpha2(m *v1alpha1.GetTransformRequest) *v1alpha2.GetTransformRequest {
	return &v1alpha2.GetTransformRequest{
		Name: m.GetName(),
	}
}

func (*mapper) v1alpha2TransformMetadataToV1alpha1(t *v1alpha2.TransformMetadata) *v1alpha1.TransformMetadata {
	sts := make([]*v1alpha1.PartitionTransformStatus, 0, len(t.GetStatuses()))
	for _, s := range t.GetStatuses() {
		sts = append(sts, &v1alpha1.PartitionTransformStatus{
			BrokerId:    s.GetBrokerId(),
			PartitionId: s.GetPartitionId(),
			Status:      v1alpha2TransformStatusToV1alpha1(s.GetStatus()),
			Lag:         s.GetLag(),
		})
	}

	evs := make([]*v1alpha1.TransformMetadata_EnvironmentVariable, 0, len(t.GetEnvironmentVariables()))
	for _, ev := range t.GetEnvironmentVariables() {
		evs = append(evs, &v1alpha1.TransformMetadata_EnvironmentVariable{
			Key:   ev.GetKey(),
			Value: ev.GetValue(),
		})
	}

	return &v1alpha1.TransformMetadata{
		Name:                 t.GetName(),
		InputTopicName:       t.GetInputTopicName(),
		OutputTopicNames:     t.GetOutputTopicNames(),
		Statuses:             sts,
		EnvironmentVariables: evs,
	}
}

func (*mapper) v1alpha1ToDeleteTransformv1alpha2(m *v1alpha1.DeleteTransformRequest) *v1alpha2.DeleteTransformRequest {
	return &v1alpha2.DeleteTransformRequest{
		Name: m.GetName(),
	}
}
