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

	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
)

func findTransformsByNameContains(transforms []*v1alpha2.TransformMetadata, name string) []*v1alpha2.TransformMetadata {
	matchedTransforms := make([]*v1alpha2.TransformMetadata, 0, len(transforms))
	for _, transform := range transforms {
		if strings.Contains(transform.Name, name) {
			matchedTransforms = append(matchedTransforms, transform)
		}
	}
	return matchedTransforms
}

func findExactTransformByName(transforms []*v1alpha2.TransformMetadata, name string) (*v1alpha2.TransformMetadata, error) {
	for _, transform := range transforms {
		if transform.Name == name {
			return transform, nil
		}
	}
	return nil, fmt.Errorf("the requested transform %q does not exist", name)
}
