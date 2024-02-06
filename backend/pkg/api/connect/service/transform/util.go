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
	"strings"

	"connectrpc.com/connect"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	commonv1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/common/v1alpha1"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

func findTransformByName(transforms []*v1alpha1.TransformMetadata, name string) (*v1alpha1.TransformMetadata, error) {
	for _, transform := range transforms {
		if strings.Contains(transform.Name, name) {
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

func findExactTransformByName(transforms []*v1alpha1.TransformMetadata, name string) (*v1alpha1.TransformMetadata, error) {
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
