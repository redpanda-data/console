// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package testutil package holds common utility functions for testing
package testutil

import (
	"context"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// RunHTTPBinContainer starts and httpbin (kennethreitz/httpbin) container it accepts the default testcontainers options like WithNetwork, WithImage
func RunHTTPBinContainer(ctx context.Context, opts ...testcontainers.ContainerCustomizer) (testcontainers.Container, error) {
	req := testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Hostname:     "httpbin",
			Image:        "kennethreitz/httpbin",
			ExposedPorts: []string{"80/tcp"},
			WaitingFor:   wait.ForHTTP("/"),
		},
		Started: true,
	}

	for _, opt := range opts {
		opt.Customize(&req)
	}

	container, err := testcontainers.GenericContainer(ctx, req)
	if err != nil {
		return nil, err
	}

	return container, nil
}
