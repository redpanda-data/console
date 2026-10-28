// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package rpconnect

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	dataplanev1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

func TestGetComponentList(t *testing.T) {
	list, err := GetComponentList()
	require.NoError(t, err)

	// ComponentList.version is semver (no "v" prefix).
	assert.Regexp(t, `^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$`, list.GetVersion())
	for name, specs := range map[string][]*dataplanev1.ComponentSpec{
		"buffers": list.GetBuffers(), "caches": list.GetCaches(), "inputs": list.GetInputs(), "outputs": list.GetOutputs(),
		"processors": list.GetProcessors(), "rate_limits": list.GetRateLimits(), "metrics": list.GetMetrics(),
		"tracers": list.GetTracers(), "scanners": list.GetScanners(),
	} {
		assert.NotEmpty(t, specs, name)
	}
	assert.NotEmpty(t, list.GetBloblangFunctions())
	assert.NotEmpty(t, list.GetBloblangMethods())

	var generate *dataplanev1.ComponentSpec
	for _, c := range list.GetInputs() {
		if c.GetName() == "generate" {
			generate = c
		}
	}
	require.NotNil(t, generate)
	assert.Equal(t, "input", generate.GetType())
	assert.Equal(t, dataplanev1.ComponentStatus_COMPONENT_STATUS_STABLE, generate.GetStatus())
	assert.Equal(t, []string{"Utility"}, generate.GetCategories())

	fields := map[string]*dataplanev1.FieldSpec{}
	for _, f := range generate.GetConfig().GetChildren() {
		fields[f.GetName()] = f
	}
	require.Contains(t, fields, "interval")
	assert.Equal(t, "1s", fields["interval"].GetDefaultValue())
	require.Contains(t, fields, "count")
	assert.Empty(t, fields["count"].GetDefaultValue(), "only string defaults are kept, as in Cloud")
}

func TestComponentStatus(t *testing.T) {
	assert.Equal(t, dataplanev1.ComponentStatus_COMPONENT_STATUS_BETA, componentStatus("beta"))
	assert.Equal(t, dataplanev1.ComponentStatus_COMPONENT_STATUS_EXPERIMENTAL, componentStatus("experimental"))
	assert.Equal(t, dataplanev1.ComponentStatus_COMPONENT_STATUS_DEPRECATED, componentStatus("deprecated"))
	assert.Equal(t, dataplanev1.ComponentStatus_COMPONENT_STATUS_UNSPECIFIED, componentStatus("unknown"))
}
