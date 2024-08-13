// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package transform

import (
	"testing"

	"github.com/stretchr/testify/assert"

	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
)

func TestFindTransformByName(t *testing.T) {
	transforms := []*v1alpha2.TransformMetadata{
		{Name: "transform1"},
		{Name: "transform2"},
		{Name: "another-transform"},
	}

	tests := []struct {
		name           string
		transforms     []*v1alpha2.TransformMetadata
		searchName     string
		expectedResult []*v1alpha2.TransformMetadata
	}{
		{"ExistingTransform", transforms, "transform1", []*v1alpha2.TransformMetadata{{Name: "transform1"}}},
		{"NonExistingTransform", transforms, "non-existing", []*v1alpha2.TransformMetadata{}},
		{"EmptyTransformList", []*v1alpha2.TransformMetadata{}, "transform1", []*v1alpha2.TransformMetadata{}},
		{"NilSlice", nil, "transform1", []*v1alpha2.TransformMetadata{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := findTransformsByNameContains(tt.transforms, tt.searchName)
			assert.Equal(t, tt.expectedResult, result)
		})
	}
}

func TestFindExactTransformByName(t *testing.T) {
	transforms := []*v1alpha2.TransformMetadata{
		{Name: "transform1"},
		{Name: "transform2"},
		{Name: "another-transform"},
	}

	tests := []struct {
		name           string
		transforms     []*v1alpha2.TransformMetadata
		searchName     string
		expectedResult *v1alpha2.TransformMetadata
		expectedError  string
	}{
		{"ExistingExactTransform", transforms, "transform1", &v1alpha2.TransformMetadata{Name: "transform1"}, ""},
		{"NonExistingExactTransform", transforms, "non-existing", nil, "the requested transform \"non-existing\" does not exist"},
		{"PartialName", transforms, "transform", nil, "the requested transform \"transform\" does not exist"},
		{"EmptyTransformList", []*v1alpha2.TransformMetadata{}, "transform1", nil, "the requested transform \"transform1\" does not exist"},
		{"DuplicateTransformNames", []*v1alpha2.TransformMetadata{{Name: "transform1"}, {Name: "transform1"}}, "transform1", &v1alpha2.TransformMetadata{Name: "transform1"}, ""},
		{"NilSlice", nil, "transform1", nil, "the requested transform \"transform1\" does not exist"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := findExactTransformByName(tt.transforms, tt.searchName)

			if tt.expectedError != "" {
				assert.EqualError(t, err, tt.expectedError)
				assert.Nil(t, result)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expectedResult, result)
			}
		})
	}
}
