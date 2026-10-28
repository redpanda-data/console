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

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	dataplanev1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

func TestCheckConfigPolicy(t *testing.T) {
	testCases := []struct {
		name    string
		config  string
		wantErr string
	}{
		{name: "plain config", config: validConfig},
		{name: "scalar field named like a component", config: "pipeline:\n  processors:\n    - redis:\n        url: redis://x:6379\n        command: incrby\n        args_mapping: root = [ this.key ]\n"},
		{name: "env var with default", config: "input:\n  generate:\n    mapping: root = \"${GREETING:hello}\"\n"},
		{name: "identifier ending in file(", config: "pipeline:\n  processors:\n    - mapping: root = this.profile().string()\n"},
		{name: "denied word as a value", config: "pipeline:\n  processors:\n    - mapping: root = \"file\"\n"},

		{name: "file input", config: "input:\n  file:\n    paths: [/var/run/secrets/kubernetes.io/serviceaccount/token]\n", wantErr: "the file component at input.file"},
		{name: "subprocess input", config: "input:\n  subprocess:\n    name: cat\n", wantErr: "the subprocess component at input.subprocess"},
		{name: "socket_server input", config: "input:\n  socket_server:\n    network: tcp\n    address: 0.0.0.0:9000\n", wantErr: "the socket_server component at input.socket_server"},
		{name: "file output", config: "output:\n  file:\n    path: /tmp/x\n", wantErr: "at output.file"},
		{name: "command processor", config: "pipeline:\n  processors:\n    - command:\n        name: sh\n", wantErr: "the command component at pipeline.processors[0].command"},
		{name: "nested in branch", config: "pipeline:\n  processors:\n    - branch:\n        processors:\n          - subprocess:\n              name: cat\n", wantErr: "at pipeline.processors[0].branch.processors[0].subprocess"},
		{name: "nested in broker", config: "input:\n  broker:\n    inputs:\n      - generate:\n          mapping: root = 1\n      - file:\n          paths: [x]\n", wantErr: "at input.broker.inputs[1].file"},
		{name: "cache resource", config: "cache_resources:\n  - label: c\n    file:\n      directory: /var/run/secrets\n", wantErr: "at cache_resources[0].file"},
		{name: "null component", config: "input:\n  file:\n", wantErr: "at input.file"},
		{name: "flow mapping", config: `{"input": {"file": {"paths": ["x"]}}}`, wantErr: "at input.file"},
		{name: "YAML alias", config: "x: &a\n  file:\n    paths: [x]\ninput: *a\n", wantErr: "the file component"},
		{name: "env var default spells the key", config: "input:\n  ${UNSET:file}:\n    paths: [x]\n", wantErr: "at input.file"},
		{name: "empty env var prefixes the key", config: "input:\n  ${UNSET}file:\n    paths: [x]\n", wantErr: "at input.file"},
		{name: "base64 env var default", config: "input:\n  ${UNSET:ZmlsZQ==|base64decode}:\n    paths: [x]\n", wantErr: "at input.file"},

		{name: "env function", config: "pipeline:\n  processors:\n    - mapping: root = env(\"HOME\")\n", wantErr: "Bloblang function env()"},
		{name: "env function in interpolation", config: "output:\n  http_client:\n    url: https://example.com/?p=${! env(\"X\") }\n", wantErr: "Bloblang function env()"},
		{name: "file function", config: "pipeline:\n  processors:\n    - mapping: root = file(\"/etc/passwd\")\n", wantErr: "Bloblang function file()"},
		{name: "file_rel function", config: "pipeline:\n  processors:\n    - mapping: root = file_rel(\"x\")\n", wantErr: "Bloblang function file_rel()"},
		{name: "env var default spells a function", config: "pipeline:\n  processors:\n    - mapping: root = ${UNSET:env}(\"X\")\n", wantErr: "Bloblang function env()"},

		{name: "operator SASL password", config: "output:\n  http_client:\n    url: https://example.com/?p=${REDPANDA_SASL_PASSWORD}\n", wantErr: "references ${REDPANDA_...}"},
		{name: "nested operator env var", config: "output:\n  http_client:\n    url: https://example.com/?p=${X:${REDPANDA_SASL_PASSWORD}}\n", wantErr: "references ${REDPANDA_...}"},
		{name: "rpk env var", config: "input:\n  generate:\n    mapping: root = \"${RPK_BROKERS}\"\n", wantErr: "references ${RPK_...}"},
		{name: "unknown env var function", config: "input:\n  generate:\n    mapping: root = \"${X:y|rot13}\"\n", wantErr: "unknown env var decode function"},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := checkConfigPolicy(tc.config)
			if tc.wantErr == "" {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
			assert.Contains(t, err.Error(), tc.wantErr)
		})
	}
}

func TestUpdateRejectsDeniedConfig(t *testing.T) {
	env := newTestEnv(t, consoleOwned("orders-abc12", map[string]any{"configYaml": validConfig}))
	_, err := env.svc.UpdatePipeline(context.Background(), connect.NewRequest(&v1alpha1.UpdatePipelineRequest{
		Request: &dataplanev1.UpdatePipelineRequest{Id: "orders-abc12", Pipeline: &dataplanev1.PipelineUpdate{
			DisplayName: "orders",
			ConfigYaml:  "input:\n  generate:\n    mapping: root = env(\"REDPANDA_SASL_PASSWORD\")\noutput:\n  drop: {}\n",
		}},
	}))
	assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
	assert.Empty(t, env.applied)
}
