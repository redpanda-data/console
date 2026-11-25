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
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/twmb/franz-go/pkg/sr"
)

// TestSchemaIDsByGUID checks that a GUID lookup lists every context, ignores
// the request context, and is cached per tenant.
func (s *TestCachedClientSuite) TestSchemaIDsByGUID() {
	convoy := sr.Schema{Schema: `{"type": "record", "name": "Convoy", "fields": [{"name": "id", "type": "string"}]}`}
	s.mockRegistry.SeedSchema("convoy-value", 1, 8, convoy)
	s.mockRegistry.SeedSchema(":.outgo:convoy-value", 1, 7, convoy)

	registered, ok := s.mockRegistry.GetSchema("convoy-value", 1)
	s.Require().True(ok)
	guid := registered.GUID
	s.Require().NotEmpty(guid)

	var mu sync.Mutex
	var paths []string
	s.mockRegistry.Intercept(func(_ http.ResponseWriter, r *http.Request) bool {
		mu.Lock()
		defer mu.Unlock()
		paths = append(paths, r.URL.Path)
		return false
	})

	want := []sr.ContextID{{Context: ".", ID: 8}, {Context: ".outgo", ID: 7}}

	ids, err := s.cachedClient.SchemaIDsByGUID(getTenantContext("tenant1"), guid)
	s.Require().NoError(err)
	s.Equal(want, ids)

	// Another context for the same tenant: same answer, served from the cache.
	ids, err = s.cachedClient.SchemaIDsByGUID(InContext(getTenantContext("tenant1"), ".outgo"), guid)
	s.Require().NoError(err)
	s.Equal(want, ids)

	// Another tenant has its own cache entry. The request has no context prefix.
	ids, err = s.cachedClient.SchemaIDsByGUID(InContext(getTenantContext("tenant2"), ".outgo"), guid)
	s.Require().NoError(err)
	s.Equal(want, ids)

	mu.Lock()
	defer mu.Unlock()
	guidPath := "/schemas/guids/" + guid + "/ids"
	s.Equal([]string{guidPath, guidPath}, paths)
}

// TestSchemaIDsByGUID_RoutesMissing checks that a registry without GUID routes
// is asked once per tenant, not once per GUID.
func (s *TestCachedClientSuite) TestSchemaIDsByGUID_RoutesMissing() {
	var mu sync.Mutex
	requests := 0
	s.mockRegistry.Intercept(func(w http.ResponseWriter, r *http.Request) bool {
		if !strings.HasPrefix(r.URL.Path, "/schemas/guids/") {
			return false
		}
		mu.Lock()
		requests++
		mu.Unlock()
		// The answer of Redpanda to an unknown route.
		w.Header().Set("Content-Type", "application/vnd.schemaregistry.v1+json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error_code":404,"message":"HTTP 404 Not Found"}`))
		return true
	})

	for i := range 5 {
		guid := fmt.Sprintf("00000000-0000-0000-0000-00000000000%d", i)
		_, err := s.cachedClient.SchemaIDsByGUID(getTenantContext("tenant1"), guid)
		s.Require().Error(err)
		s.True(IsRouteNotFound(err), "GUID %d: %v", i, err)
	}
	_, err := s.cachedClient.SchemaIDsByGUID(getTenantContext("tenant2"), "00000000-0000-0000-0000-000000000000")
	s.True(IsRouteNotFound(err))

	mu.Lock()
	defer mu.Unlock()
	s.Equal(2, requests, "one request for each tenant")
}

// TestSchemaIDsByGUID_UnknownGUID checks that a registry with GUID routes is
// not marked as one without them when it does not know a GUID.
func (s *TestCachedClientSuite) TestSchemaIDsByGUID_UnknownGUID() {
	convoy := sr.Schema{Schema: `{"type": "record", "name": "Convoy", "fields": [{"name": "id", "type": "string"}]}`}
	s.mockRegistry.SeedSchema("convoy-value", 1, 8, convoy)
	registered, ok := s.mockRegistry.GetSchema("convoy-value", 1)
	s.Require().True(ok)

	ids, err := s.cachedClient.SchemaIDsByGUID(getTenantContext("tenant1"), "00000000-0000-0000-0000-000000000000")
	s.False(IsRouteNotFound(err))
	s.Empty(ids)

	ids, err = s.cachedClient.SchemaIDsByGUID(getTenantContext("tenant1"), registered.GUID)
	s.Require().NoError(err)
	s.Equal([]sr.ContextID{{Context: ".", ID: 8}}, ids)
}
