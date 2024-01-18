// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package testutil

import (
	"context"
	"strings"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// RunRedpandaConnectorsContainer runs a container with the connectors image
// and returns the running testcontainer, it uses redpandadata/connectors image
// not every option works but we can take advantage of the image customizer for instance
func RunRedpandaConnectorsContainer(ctx context.Context, bootstrapServers []string, opts ...testcontainers.ContainerCustomizer) (testcontainers.Container, error) {
	const testConnectConfig = `key.converter=org.apache.kafka.connect.converters.ByteArrayConverter
	value.converter=org.apache.kafka.connect.converters.ByteArrayConverter
	group.id=connectors-cluster
	offset.storage.topic=_internal_connectors_offsets
	config.storage.topic=_internal_connectors_configs
	status.storage.topic=_internal_connectors_status
	config.storage.replication.factor=-1
	offset.storage.replication.factor=-1
	status.storage.replication.factor=-1
	`
	const waitTimeout = 3 * time.Minute
	childCtx, cancel := context.WithTimeout(ctx, waitTimeout)
	defer cancel()

	request := testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "redpandadata/connectors:v1.0.13",
			ExposedPorts: []string{"8083/tcp"},
			Env: map[string]string{
				"CONNECT_CONFIGURATION":     testConnectConfig,
				"CONNECT_BOOTSTRAP_SERVERS": strings.Join(bootstrapServers, ","),
				"CONNECT_GC_LOG_ENABLED":    "false",
				"CONNECT_HEAP_OPTS":         "-Xms512M -Xmx512M",
				"CONNECT_LOG_LEVEL":         "info",
			},
			WaitingFor: wait.ForAll(
				wait.ForLog("Kafka Connect started").
					WithPollInterval(500 * time.Millisecond).
					WithStartupTimeout(waitTimeout),
			),
		},
		Started: true,
	}

	for _, opt := range opts {
		opt.Customize(&request)
	}

	return testcontainers.GenericContainer(childCtx, request)
}
