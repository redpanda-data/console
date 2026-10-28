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
	"fmt"

	"connectrpc.com/connect"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	dataplanev1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
	"github.com/redpanda-data/console/backend/pkg/rpconnect"
)

var _ dataplanev1connect.PipelineServiceHandler = (*ComponentService)(nil)

// ComponentService serves ListComponents from dataplane.v1.PipelineService,
// which the pipeline editor calls for component docs. Pipeline CRUD goes
// through the console v1alpha1 PipelineService, so the other RPCs are
// unimplemented.
type ComponentService struct {
	dataplanev1connect.UnimplementedPipelineServiceHandler
}

// ListComponents lists the components in the bundled Redpanda Connect schema.
func (*ComponentService) ListComponents(_ context.Context, req *connect.Request[dataplanev1.ListComponentsRequest]) (*connect.Response[dataplanev1.ListComponentsResponse], error) {
	list, err := rpconnect.GetComponentList()
	if err != nil {
		return nil, apierrors.NewConnectError(connect.CodeInternal, err, apierrors.NewErrorInfo(dataplanev1.Reason_REASON_CONSOLE_ERROR.String()))
	}
	if paths := req.Msg.GetReadMask().GetPaths(); len(paths) > 0 {
		if list, err = readMask(list, paths); err != nil {
			return nil, err
		}
	}
	return connect.NewResponse(&dataplanev1.ListComponentsResponse{Components: list}), nil
}

// componentListFields copies one top-level ComponentList field. The masked
// response shares the slices of the shared read-only list instead of cloning
// all of it.
var componentListFields = map[string]func(out, in *dataplanev1.ComponentList){
	"version":            func(out, in *dataplanev1.ComponentList) { out.Version = in.Version },
	"buffers":            func(out, in *dataplanev1.ComponentList) { out.Buffers = in.Buffers },
	"caches":             func(out, in *dataplanev1.ComponentList) { out.Caches = in.Caches },
	"inputs":             func(out, in *dataplanev1.ComponentList) { out.Inputs = in.Inputs },
	"outputs":            func(out, in *dataplanev1.ComponentList) { out.Outputs = in.Outputs },
	"processors":         func(out, in *dataplanev1.ComponentList) { out.Processors = in.Processors },
	"rate_limits":        func(out, in *dataplanev1.ComponentList) { out.RateLimits = in.RateLimits },
	"metrics":            func(out, in *dataplanev1.ComponentList) { out.Metrics = in.Metrics },
	"tracers":            func(out, in *dataplanev1.ComponentList) { out.Tracers = in.Tracers },
	"scanners":           func(out, in *dataplanev1.ComponentList) { out.Scanners = in.Scanners },
	"bloblang_functions": func(out, in *dataplanev1.ComponentList) { out.BloblangFunctions = in.BloblangFunctions },
	"bloblang_methods":   func(out, in *dataplanev1.ComponentList) { out.BloblangMethods = in.BloblangMethods },
}

// readMask keeps only the listed top-level ComponentList fields (for example
// "inputs" or "bloblang_functions"). The result shares slices with list, so
// neither may be modified.
func readMask(list *dataplanev1.ComponentList, paths []string) (*dataplanev1.ComponentList, error) {
	out := &dataplanev1.ComponentList{}
	for _, p := range paths {
		set, ok := componentListFields[p]
		if !ok {
			return nil, newInvalidArgument("read_mask", fmt.Sprintf("unsupported read_mask path %q", p))
		}
		set(out, list)
	}
	return out, nil
}
