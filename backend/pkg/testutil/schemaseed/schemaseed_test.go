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
			"matrix-avro-default":  8,
			"matrix-proto-staging": 8,
			"matrix-json-prod":     8,
			"proto-nested-default": 6,
			"refs-prod":            2,
			"edge-cases":           8,
		}, counts)
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

	t.Run("references resolve in the request context", func(t *testing.T) {
		ref, err := client.SchemaByVersion(sr.InContext(t.Context(), ContextProd), "money.proto", 1)
		require.NoError(t, err)
		assert.Equal(t, 1, ref.ID)
	})
}
