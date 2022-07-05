// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package testcontainers

import (
	"context"
	_ "embed"
	"fmt"
	"io/ioutil"
	"strconv"
	"text/template"

	"github.com/docker/go-connections/nat"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
	"github.com/twmb/franz-go/pkg/kgo"
)

var (
	//go:embed redpanda_node_config.tpl
	redpandaNodeConfigTpl string
)

// Redpanda wraps a redpanda testcontainer. Terminate must be called
// when the container is no longer needed, so temporary files can be
// cleaned up
type Redpanda struct {
	testcontainers.Container
	KafkaAddr string
	HTTPAddr  string
}

type redpandaConfigTplParams struct {
	KafkaPort int
	AdminPort int
}

// NewRedpanda creates a new redpanda testcontainer. Terminate must be
// called once the container is not needed anymore.
func NewRedpanda(ctx context.Context, opts ...RedpandaOption) (*Redpanda, error) {
	// 0. Gather all config options (defaults + apply provided options)
	settings := redpandaOptions{
		KafkaPort:       39092,
		HTTPPort:        39644,
		RedpandaVersion: "v22.1.4",
	}
	for _, opt := range opts {
		opt(&settings)
	}

	// 1. Render node config file and mount it
	tplParams := redpandaConfigTplParams{
		KafkaPort: settings.KafkaPort,
		AdminPort: settings.HTTPPort,
	}

	tpl, err := template.New("redpandaConfig").Parse(redpandaNodeConfigTpl)
	if err != nil {
		return nil, fmt.Errorf("failed to parse redpanda config file template: %w", err)
	}

	configFile, err := ioutil.TempFile("", "")
	if err != nil {
		return nil, err
	}

	err = tpl.Execute(configFile, tplParams)
	if err != nil {
		return nil, fmt.Errorf("failed to render redpanda config template: %w", err)
	}

	// 2. Create container request
	req := testcontainers.ContainerRequest{
		Image: fmt.Sprintf("docker.vectorized.io/vectorized/redpanda:%s", settings.RedpandaVersion),
		WaitingFor: wait.ForAll(
			wait.ForHTTP("/v1").WithPort(nat.Port(strconv.Itoa(settings.HTTPPort))),
			wait.ForListeningPort(nat.Port(strconv.Itoa(settings.KafkaPort))),
			wait.ForLog("Successfully started Redpanda!")),
		User:         "root:root",
		ExposedPorts: []string{formatTCPPort(settings.KafkaPort), formatTCPPort(settings.HTTPPort)},
		Mounts: testcontainers.Mounts(
			testcontainers.BindMount(configFile.Name(), "/etc/redpanda/redpanda.yaml"),
		),
		Cmd: []string{
			"redpanda",
			"start",
			"--smp", "1",
			"--reserve-memory", "0M",
			"--overprovisioned",
			"--node-id", "0",
			"--kafka-addr", fmt.Sprintf("OUTSIDE://0.0.0.0:%d", settings.KafkaPort),
			"--advertise-kafka-addr", fmt.Sprintf("OUTSIDE://localhost:%d", settings.KafkaPort),
		},
	}

	// 3. Start the container
	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	if err != nil {
		return nil, err
	}

	// 4. Verify the Kafka connection with a Kafka client
	seed := fmt.Sprintf("%v:%v", "localhost", settings.KafkaPort)
	kgoOpts := []kgo.Opt{kgo.SeedBrokers(seed)}
	err = testKafkaConnection(ctx, kgoOpts...)
	if err != nil {
		return nil, fmt.Errorf("failed to test Kafka connectivity: %w", err)
	}

	return &Redpanda{
		Container: container,
		KafkaAddr: fmt.Sprintf("%s:%d", "localhost", settings.KafkaPort),
		HTTPAddr:  fmt.Sprintf("%s:%d", "localhost", settings.HTTPPort),
	}, nil
}
