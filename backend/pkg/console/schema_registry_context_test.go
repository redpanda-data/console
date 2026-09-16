// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"net/http"
	"testing"

	"github.com/redpanda-data/common-go/rpsr"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/sr"
	"github.com/twmb/franz-go/pkg/sr/srfake"
)

func TestSchemaUsagesAcrossContexts(t *testing.T) {
	registry := srfake.New()
	defer registry.Close()

	registry.SeedSchema("orders-value", 1, 1, sr.Schema{
		Schema: `{"type":"record","name":"Order","fields":[{"name":"id","type":"string"}]}`,
	})
	registry.SeedSchema(":.outgo:convoy-value", 1, 7, sr.Schema{
		Schema: `{"type":"record","name":"Convoy","fields":[{"name":"id","type":"string"}]}`,
	})

	srClient, err := sr.NewClient(sr.URLs(registry.URL()))
	require.NoError(t, err)
	client, err := rpsr.NewClient(srClient)
	require.NoError(t, err)

	t.Run("id that only exists in a named context", func(t *testing.T) {
		got, err := schemaUsagesAcrossContexts(t.Context(), client, 7)
		require.NoError(t, err)
		assert.Equal(t, []SchemaVersion{{Subject: ":.outgo:convoy-value", Version: 1}}, got)
	})

	t.Run("id in the default context", func(t *testing.T) {
		got, err := schemaUsagesAcrossContexts(t.Context(), client, 1)
		require.NoError(t, err)
		assert.Equal(t, []SchemaVersion{{Subject: "orders-value", Version: 1}}, got)
	})

	t.Run("unknown id reports the registry's not-found error", func(t *testing.T) {
		_, err := schemaUsagesAcrossContexts(t.Context(), client, 99)
		require.Error(t, err)
		var respErr *sr.ResponseError
		require.ErrorAs(t, err, &respErr)
		assert.Equal(t, http.StatusNotFound, respErr.StatusCode)
	})
}
