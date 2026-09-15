// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package schema

import (
	"net/http"
	"sync"

	"github.com/twmb/franz-go/pkg/sr"
)

// TestSchemaContextScoping checks that InContext lookups hit the context route
// and are cached apart from the default context.
func (s *TestCachedClientSuite) TestSchemaContextScoping() {
	avroSchema := `{"type": "record", "name": "Convoy", "fields": [{"name": "id", "type": "string"}]}`
	s.mockRegistry.SeedSchema(":.outgo:convoy-value", 1, 7, sr.Schema{Schema: avroSchema})

	var mu sync.Mutex
	var paths []string
	s.mockRegistry.Intercept(func(_ http.ResponseWriter, r *http.Request) bool {
		mu.Lock()
		defer mu.Unlock()
		paths = append(paths, r.URL.Path)
		return false
	})

	ctx := getTenantContext("tenant1")
	scoped := InContext(ctx, ".outgo")

	sch, err := s.cachedClient.SchemaByID(scoped, 7)
	s.Require().NoError(err)
	s.JSONEq(avroSchema, sch.Schema)

	parsed, err := s.cachedClient.AvroSchemaByID(scoped, 7)
	s.Require().NoError(err)
	s.NotNil(parsed)

	// Same context, other spellings: served from the cache.
	_, err = s.cachedClient.SchemaByID(InContext(ctx, "outgo"), 7)
	s.Require().NoError(err)
	_, err = s.cachedClient.SchemaByID(InContext(ctx, ":.outgo:"), 7)
	s.Require().NoError(err)

	// Default context: own request and cache entry.
	_, err = s.cachedClient.SchemaByID(ctx, 7)
	s.Require().NoError(err)
	_, err = s.cachedClient.SchemaByID(InContext(ctx, "."), 7)
	s.Require().NoError(err)

	mu.Lock()
	defer mu.Unlock()
	s.Equal([]string{"/contexts/.outgo/schemas/ids/7", "/schemas/ids/7"}, paths)
}

// TestSchemaContextIsolatesTenants checks that the context extends the tenant
// namespace instead of replacing it.
func (s *TestCachedClientSuite) TestSchemaContextIsolatesTenants() {
	s.mockRegistry.SeedSchema(":.outgo:convoy-value", 1, 7, sr.Schema{
		Schema: `{"type": "record", "name": "Convoy", "fields": [{"name": "id", "type": "string"}]}`,
	})

	var mu sync.Mutex
	requests := 0
	s.mockRegistry.Intercept(func(_ http.ResponseWriter, _ *http.Request) bool {
		mu.Lock()
		defer mu.Unlock()
		requests++
		return false
	})

	_, err := s.cachedClient.SchemaByID(InContext(getTenantContext("tenant1"), ".outgo"), 7)
	s.Require().NoError(err)
	_, err = s.cachedClient.SchemaByID(InContext(getTenantContext("tenant2"), ".outgo"), 7)
	s.Require().NoError(err)
	_, err = s.cachedClient.SchemaByID(InContext(getTenantContext("tenant1"), ".outgo"), 7)
	s.Require().NoError(err)

	mu.Lock()
	defer mu.Unlock()
	s.Equal(2, requests, "one request per tenant, the repeat is cached")
}
