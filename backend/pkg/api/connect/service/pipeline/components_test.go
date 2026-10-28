// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package pipeline

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	dataplanev1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

func TestListComponents(t *testing.T) {
	svc := &ComponentService{}

	res, err := svc.ListComponents(context.Background(), connect.NewRequest(&dataplanev1.ListComponentsRequest{}))
	require.NoError(t, err)
	all := res.Msg.GetComponents()
	assert.NotEmpty(t, all.GetInputs())
	assert.NotEmpty(t, all.GetBloblangFunctions())

	res, err = svc.ListComponents(context.Background(), connect.NewRequest(&dataplanev1.ListComponentsRequest{
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{"inputs", "bloblang_functions"}},
	}))
	require.NoError(t, err)
	masked := res.Msg.GetComponents()
	assert.Len(t, masked.GetInputs(), len(all.GetInputs()))
	assert.Len(t, masked.GetBloblangFunctions(), len(all.GetBloblangFunctions()))
	assert.Empty(t, masked.GetOutputs())
	assert.Empty(t, masked.GetVersion())
	assert.NotEmpty(t, all.GetOutputs(), "masking must not modify the shared list")

	_, err = svc.ListComponents(context.Background(), connect.NewRequest(&dataplanev1.ListComponentsRequest{
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{"inputs.name"}},
	}))
	assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))

	_, err = svc.ListPipelines(context.Background(), connect.NewRequest(&dataplanev1.ListPipelinesRequest{}))
	assert.Equal(t, connect.CodeUnimplemented, connect.CodeOf(err), "CRUD goes through the console v1alpha1 PipelineService")
}

func TestReadMaskSharesSlicesAndCoversEveryField(t *testing.T) {
	list := &dataplanev1.ComponentList{Inputs: []*dataplanev1.ComponentSpec{{Name: "generate"}}}
	out, err := readMask(list, []string{"inputs"})
	require.NoError(t, err)
	assert.Same(t, list.GetInputs()[0], out.GetInputs()[0], "masking assigns slices instead of cloning")

	fields := list.ProtoReflect().Descriptor().Fields()
	for i := range fields.Len() {
		assert.Contains(t, componentListFields, string(fields.Get(i).Name()))
	}
	assert.Len(t, componentListFields, fields.Len())
}
