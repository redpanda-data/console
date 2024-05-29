// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package integration

import (
	"context"
	_ "embed"
	"net/http"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	v1alpha1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
)

var (
	//go:embed rpconnect/good-config.yaml
	goodConfig string
	//go:embed rpconnect/bad-config.yaml
	badConfig string
)

func (s *APISuite) TestLintRedpandaConnectConfig() {
	t := s.T()

	client := v1alpha1connect.NewRedpandaConnectServiceClient(http.DefaultClient, s.httpAddress())

	t.Run("lint rp connect YAML config (bad config)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		req := &v1alpha1.LintConfigRequest{YamlConfig: badConfig}
		res, err := client.LintConfig(ctx, connect.NewRequest(req))
		require.NoError(err)
		lints := res.Msg.GetLints()
		assert.Equal(4, len(lints))
		assert.False(res.Msg.GetValid())
	})

	t.Run("parsing failed for linting rp connect config", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		req := &v1alpha1.LintConfigRequest{YamlConfig: "item: [unbalanced brackets"}
		res, err := client.LintConfig(ctx, connect.NewRequest(req))
		assert.Error(err)
		assert.Nil(res)
		assert.Equal(connect.CodeInvalidArgument.String(), connect.CodeOf(err).String())
	})

	t.Run("lint rp connect YAML config (good config)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		req := &v1alpha1.LintConfigRequest{YamlConfig: goodConfig}
		res, err := client.LintConfig(ctx, connect.NewRequest(req))
		require.NoError(err)
		lints := res.Msg.GetLints()
		assert.Equal(0, len(lints))
		assert.True(res.Msg.GetValid())
	})
}
