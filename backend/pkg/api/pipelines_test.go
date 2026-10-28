// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"

	pipelinesvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/pipeline"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
)

func TestPipelineConnectServices(t *testing.T) {
	services := map[string]any{
		consolev1alpha1connect.PipelineServiceName: consolev1alpha1connect.UnimplementedPipelineServiceHandler{},
		dataplanev1connect.PipelineServiceName:     &pipelinesvc.ComponentService{},
	}
	names := func(svcs []ConnectService) []string {
		var out []string
		for _, s := range svcs {
			out = append(out, s.ServiceName)
		}
		return out
	}

	assert.ElementsMatch(t,
		[]string{consolev1alpha1connect.PipelineServiceName, dataplanev1connect.PipelineServiceName},
		names(pipelineConnectServices(ConfigConnectRPCResponse{Services: services})))

	// A service the hook mounts itself is skipped: chi panics on duplicate mounts.
	hooked := ConfigConnectRPCResponse{
		Services:           services,
		AdditionalServices: []ConnectService{{ServiceName: dataplanev1connect.PipelineServiceName, MountPath: "/x/", Handler: http.NotFoundHandler()}},
	}
	assert.Equal(t, []string{consolev1alpha1connect.PipelineServiceName}, names(pipelineConnectServices(hooked)))

	assert.Empty(t, pipelineConnectServices(ConfigConnectRPCResponse{Services: map[string]any{}}))
}
