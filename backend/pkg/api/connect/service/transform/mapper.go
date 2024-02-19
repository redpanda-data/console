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

type mapper struct{}

func (*mapper) partitionTransformStatusToProto(s string) (v1alpha1.PartitionTransformStatus_PartitionStatus, error) {
	switch s {
	case "running":
		return v1alpha1.PartitionTransformStatus_PARTITION_STATUS_RUNNING, nil
	case "inactive":
		return v1alpha1.PartitionTransformStatus_PARTITION_STATUS_INACTIVE, nil
	case "errored":
		return v1alpha1.PartitionTransformStatus_PARTITION_STATUS_ERRORED, nil
	case "unknown":
		return v1alpha1.PartitionTransformStatus_PARTITION_STATUS_UNKNOWN, nil
	default:
		return v1alpha1.PartitionTransformStatus_PARTITION_STATUS_UNSPECIFIED, fmt.Errorf("unable to convert %q to a known string that can be handled by the Redpanda Admin API", s)
	}
}

func (m *mapper) transformMetadataToProto(transforms []adminapi.TransformMetadata) ([]*v1alpha1.TransformMetadata, error) {
	apiTransforms := make([]*v1alpha1.TransformMetadata, 0, len(transforms))
	for _, transform := range transforms {
		statuses := make([]*v1alpha1.PartitionTransformStatus, len(transform.Status))
		for i, transformStatusWithMetadata := range transform.Status {
			p, err := m.transformStatusWithMetadataToProto(transformStatusWithMetadata)
			if err != nil {
				return nil, fmt.Errorf("unable to convert transform status: %w", err)
			}
			statuses[i] = p
		}

		envVars := make([]*v1alpha1.TransformMetadata_EnvironmentVariable, len(transform.Environment))
		for i, keyVal := range transform.Environment {
			envVars[i] = &v1alpha1.TransformMetadata_EnvironmentVariable{
				Key:   keyVal.Key,
				Value: keyVal.Value,
			}
		}

		apiTransforms = append(apiTransforms, &v1alpha1.TransformMetadata{
			Name:                 transform.Name,
			InputTopicName:       transform.InputTopic,
			OutputTopicNames:     transform.OutputTopics,
			Statuses:             statuses,
			EnvironmentVariables: envVars,
		})
	}
	return apiTransforms, nil
}

func (m *mapper) transformStatusWithMetadataToProto(transformStatusWithMetadata adminapi.PartitionTransformStatus) (*v1alpha1.PartitionTransformStatus, error) {
	status, err := m.partitionTransformStatusToProto(transformStatusWithMetadata.Status)
	if err != nil {
		return nil, err
	}

	return &v1alpha1.PartitionTransformStatus{
		BrokerId:    int32(transformStatusWithMetadata.NodeID),
		Status:      status,
		Lag:         int32(transformStatusWithMetadata.Lag),
		PartitionId: int32(transformStatusWithMetadata.Partition),
	}, nil
}

func (*mapper) deployTransformReqToAdminAPI(req *v1alpha1.DeployTransformRequest) adminapi.TransformMetadata {
	envVars := make([]adminapi.EnvironmentVariable, len(req.EnvironmentVariables))
	for i, keyVal := range req.EnvironmentVariables {
		envVars[i] = adminapi.EnvironmentVariable{
			Key:   keyVal.Key,
			Value: keyVal.Value,
		}
	}

	return adminapi.TransformMetadata{
		Name:         req.Name,
		InputTopic:   req.InputTopicName,
		OutputTopics: req.OutputTopicNames,
		Status:       nil, // Output only
		Environment:  envVars,
	}
}
