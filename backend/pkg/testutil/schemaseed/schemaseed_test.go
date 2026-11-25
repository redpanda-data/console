// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package schemaseed

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/sr"
)

func TestFake(t *testing.T) {
	fixture, registry, err := Fake()
	require.NoError(t, err)
	defer registry.Close()

	t.Run("scenario counts per topic", func(t *testing.T) {
		counts := make(map[string]int)
		for _, sc := range fixture.Scenarios {
			counts[sc.Topic]++
		}
		assert.Equal(t, map[string]int{
			"matrix-avro-default":         24,
			"matrix-proto-staging":        24,
			"matrix-json-prod":            24,
			"proto-nested-default":        12,
			"refs-prod":                   4,
			"guid-required-unbound":       18,
			"guid-required-cross-context": 14,
			"edge-cases":                  16,
		}, counts)
	})

	t.Run("the same schema has one GUID in every context", func(t *testing.T) {
		assert.Equal(t, fixture.Schemas[1].GUID, fixture.Schemas[9].GUID)
	})

	client, err := sr.NewClient(sr.URLs(registry.URL()))
	require.NoError(t, err)

	t.Run("schema IDs are scoped by context", func(t *testing.T) {
		inDefault, err := client.SchemaByID(t.Context(), 2)
		require.NoError(t, err)
		assert.Equal(t, sr.TypeAvro, inDefault.Type)

		inStaging, err := client.SchemaByID(sr.InContext(t.Context(), ContextStaging), 2)
		require.NoError(t, err)
		assert.Equal(t, sr.TypeProtobuf, inStaging.Type)

		_, err = client.SchemaByID(t.Context(), 5)
		require.Error(t, err)
	})

	t.Run("a GUID lists every context that has the schema", func(t *testing.T) {
		ids, err := client.SchemaIDsByGUID(t.Context(), fixture.Schemas[1].GUID)
		require.NoError(t, err)
		assert.Equal(t, []sr.ContextID{{Context: ".", ID: 2}, {Context: ContextProd, ID: 2}}, ids)

		ids, err = client.SchemaIDsByGUID(t.Context(), bogusGUID)
		require.NoError(t, err)
		assert.Empty(t, ids)
	})

	t.Run("references resolve in the request context", func(t *testing.T) {
		ref, err := client.SchemaByVersion(sr.InContext(t.Context(), ContextProd), "money.proto", 1)
		require.NoError(t, err)
		assert.Equal(t, 1, ref.ID)
	})

	t.Run("a broker without GUID routes answers 404", func(t *testing.T) {
		DisableGUIDRoutes(registry)
		_, err := client.SchemaIDsByGUID(t.Context(), fixture.Schemas[1].GUID)
		require.Error(t, err)
	})
}
