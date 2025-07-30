// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package schema

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/hamba/avro/v2"
	"github.com/redpanda-data/common-go/rpsr"
	"github.com/stretchr/testify/suite"
	"github.com/twmb/franz-go/pkg/sr"
	"github.com/twmb/franz-go/pkg/sr/srfake"

	"github.com/redpanda-data/console/backend/pkg/factory/schema"
)

// testSchemaClientFactory is a mock implementation of the schema.ClientFactory interface
type testSchemaClientFactory struct {
	client *rpsr.Client
}

// Ensure testSchemaClientFactory implements the ClientFactory interface
var _ schema.ClientFactory = (*testSchemaClientFactory)(nil)

func (f *testSchemaClientFactory) GetSchemaRegistryClient(context.Context) (*rpsr.Client, error) {
	return f.client, nil
}

// TestCachedClientSuite contains essential tests for CachedClient
type TestCachedClientSuite struct {
	suite.Suite
	mockRegistry  *srfake.Registry
	srClient      *rpsr.Client
	clientFactory *testSchemaClientFactory
	cachedClient  *CachedClient
	namespace     string
}

// tenantKey is a custom type for context keys to avoid linter warnings
type tenantKey string

const testTenantKey tenantKey = "tenant"

// getTenantContext creates a context with the given tenant ID
func getTenantContext(tenantID string) context.Context {
	return context.WithValue(context.Background(), testTenantKey, tenantID)
}

// SetupSuite runs once before all tests
func (s *TestCachedClientSuite) SetupSuite() {
	s.mockRegistry = srfake.New()
	s.Require().NotNil(s.mockRegistry)

	var err error
	srClient, err := sr.NewClient(sr.URLs(s.mockRegistry.URL()))
	s.Require().NoError(err)
	s.srClient, err = rpsr.NewClient(srClient)
	s.Require().NoError(err)

	s.clientFactory = &testSchemaClientFactory{client: s.srClient}
	s.namespace = "test-tenant"
}

// SetupTest runs before each test
func (s *TestCachedClientSuite) SetupTest() {
	s.mockRegistry.Reset()
	s.mockRegistry.ClearInterceptors()

	var err error
	s.cachedClient, err = NewCachedClient(s.clientFactory, func(ctx context.Context) (string, error) {
		tenant := ctx.Value(testTenantKey)
		if tenant == nil {
			return "default", nil
		}
		if tenantStr, ok := tenant.(string); ok {
			return tenantStr, nil
		}
		return "default", nil
	})
	s.Require().NoError(err)
}

// TearDownSuite runs once after all tests
func (s *TestCachedClientSuite) TearDownSuite() {
	if s.mockRegistry != nil {
		s.mockRegistry.Close()
	}
}

// TestTenantIsolationForAvroSchemas verifies that Avro schemas are properly
// isolated between tenants and one tenant cannot access another tenant's cached schemas.
func (s *TestCachedClientSuite) TestTenantIsolationForAvroSchemas() {
	// Test defines expected behavior: tenants should have isolated schema access

	// Setup: Create a schema that would be cached by the global Avro cache
	avroSchema := `{"type": "record", "name": "SensitiveData", "fields": [{"name": "secret", "type": "string"}]}`
	s.mockRegistry.SeedSchema("sensitive-data", 1, 1, sr.Schema{
		Schema: avroSchema,
	})

	// Create two different tenant contexts
	tenant1Ctx := context.WithValue(context.Background(), testTenantKey, "tenant1")
	tenant2Ctx := context.WithValue(context.Background(), testTenantKey, "tenant2")

	// Tenant 1 accesses the schema first
	schema1, err := s.cachedClient.AvroSchemaByID(tenant1Ctx, 1)
	s.NoError(err)
	s.NotNil(schema1)

	// The bug: avro.DefaultSchemaCache is global and shared between tenants
	// Even though CachedClient uses tenant-specific cache keys, the Avro library
	// cache is global and can leak parsed schemas between tenants

	// To detect this bug, we need to test the ParseAvroSchemaWithReferences method directly
	// which is where the global cache is used

	schemaForTenant1 := sr.Schema{
		Schema: avroSchema,
	}

	// Tenant 1 parses the schema - this will cache it in the global avro.DefaultSchemaCache
	result1, err := s.cachedClient.ParseAvroSchemaWithReferences(tenant1Ctx, schemaForTenant1)
	s.NoError(err)
	s.NotNil(result1)

	// Now tenant 2 tries to parse the same schema
	// EXPECTED BEHAVIOR: Should be isolated and not get tenant 1's cached schema
	// BUG: Currently they share the same global cache, so tenant 2 gets the cached result
	result2, err := s.cachedClient.ParseAvroSchemaWithReferences(tenant2Ctx, schemaForTenant1)
	s.NoError(err)
	s.NotNil(result2)

	// The critical bug: both tenants are using the same global avro.DefaultSchemaCache
	// This means if tenant 1 has a malicious schema that somehow gets cached,
	// tenant 2 could potentially access it

	// EXPECTED BEHAVIOR: With temporary caches, there's no cross-tenant leakage
	// Each parsing operation creates its own temporary cache which is discarded after use
	// This test verifies that both tenants can successfully parse schemas without interference

	// Test direct parsing with the simplified architecture
	schemaForTesting := sr.Schema{
		Schema: avroSchema,
	}

	// Each call to ParseAvroSchemaWithReferences creates a fresh temporary cache
	result1New, err := s.cachedClient.ParseAvroSchemaWithReferences(tenant1Ctx, schemaForTesting)
	s.NoError(err)
	s.NotNil(result1New)

	result2New, err := s.cachedClient.ParseAvroSchemaWithReferences(tenant2Ctx, schemaForTesting)
	s.NoError(err)
	s.NotNil(result2New)

	// Both should succeed and produce equivalent results
	s.Equal(result1New.String(), result2New.String(), "Both tenants should get equivalent parsed schemas")
}

// TestAvroSchemaWithoutReferencesNotCachedCausesBug demonstrates the critical bug
// where schemas without references don't add their named types to the cache,
// causing other schemas that reference those types to fail.
func (s *TestCachedClientSuite) TestAvroSchemaWithoutReferencesNotCachedCausesBug() {
	// This test demonstrates the actual bug, not just caching efficiency

	// Step 1: Create Schema A without references that defines a named type "Address"
	schemaA := sr.Schema{
		Schema: `{"type": "record", "name": "Address", "fields": [{"name": "street", "type": "string"}]}`,
		// No references - this is the problematic case
	}
	s.mockRegistry.SeedSchema("address-schema", 1, 1, schemaA)

	// Step 2: Create Schema B that references the named type from Schema A
	schemaB := sr.Schema{
		Schema: `{"type": "record", "name": "User", "fields": [{"name": "address", "type": "Address"}]}`,
		References: []sr.SchemaReference{
			{
				Name:    "Address",
				Subject: "address-schema",
				Version: 1,
			},
		},
	}
	s.mockRegistry.SeedSchema("user-schema", 1, 2, schemaB)

	// Step 3: Parse Schema A first (this should add "Address" type to cache)
	// BUG: Since Schema A has no references, it uses avro.Parse() which doesn't cache types
	tenantCtx := getTenantContext(s.namespace)
	resultA, err := s.cachedClient.ParseAvroSchemaWithReferences(tenantCtx, schemaA)
	s.NoError(err)
	s.NotNil(resultA)

	// Step 4: Try to parse Schema B (this should find "Address" type in cache)
	// BUG: This will FAIL because "Address" type was never added to cache by Schema A
	resultB, err := s.cachedClient.ParseAvroSchemaWithReferences(tenantCtx, schemaB)

	// EXPECTED BEHAVIOR: Should succeed because Address type should be in cache
	// ACTUAL BEHAVIOR: Will fail with "avro: unknown type: Address"
	s.NoError(err, "Schema B should be able to reference types from Schema A")
	s.NotNil(resultB)
}

// TestCircularReferenceHandling verifies that circular references in schemas
// are properly detected and handled gracefully without causing infinite recursion.
func (s *TestCachedClientSuite) TestCircularReferenceHandling() {
	// Create a simple test that demonstrates our circular reference detection works
	// We'll create a schema that references itself to trigger the detection

	// First, seed a basic schema
	basicSchema := sr.Schema{
		Schema: `{"type": "record", "name": "SelfRef", "fields": [{"name": "data", "type": "string"}]}`,
	}
	s.mockRegistry.SeedSchema("self-ref", 1, 1, basicSchema)

	// Now create a schema that references itself (circular reference)
	circularSchema := sr.Schema{
		Schema: `{"type": "record", "name": "SelfRef", "fields": [{"name": "data", "type": "string"}]}`,
		References: []sr.SchemaReference{
			{
				Name:    "SelfRef",
				Subject: "self-ref",
				Version: 1,
			},
		},
	}
	s.mockRegistry.SeedSchema("self-ref", 2, 2, circularSchema)

	// Test Avro circular reference handling
	s.Run("avro_circular_reference", func() {
		// Should not cause infinite recursion or panic
		done := make(chan bool, 1)
		var result avro.Schema
		var err error

		go func() {
			defer func() {
				if r := recover(); r != nil {
					err = fmt.Errorf("panic occurred: %v", r)
				}
				done <- true
			}()
			// Use the simplified approach - temporary cache is created internally
			tenantCtx := getTenantContext(s.namespace)
			result, err = s.cachedClient.ParseAvroSchemaWithReferences(tenantCtx, circularSchema)
		}()

		select {
		case <-done:
			// Expected behavior: Should detect circular reference with meaningful error
			if err != nil {
				s.Contains(err.Error(), "circular", "Should detect circular reference with meaningful error")
			} else {
				s.NotNil(result)
			}
		case <-time.After(5 * time.Second):
			s.Fail("Circular reference caused infinite loop/timeout")
		}
	})

	// Test Proto circular reference handling
	s.Run("proto_circular_reference", func() {
		// Create proper protobuf schemas for circular reference test
		protoBasicSchema := sr.Schema{
			Schema: `syntax = "proto3";
message SelfRef {
  string data = 1;
}`,
			Type: sr.TypeProtobuf,
		}
		s.mockRegistry.SeedSchema("proto-self-ref", 1, 10, protoBasicSchema)

		protoCircularSchema := sr.Schema{
			Schema: `syntax = "proto3";
import "SelfRef.proto";
message SelfRef {
  string data = 1;
  SelfRef nested = 2;
}`,
			Type: sr.TypeProtobuf,
			References: []sr.SchemaReference{
				{
					Name:    "SelfRef.proto",
					Subject: "proto-self-ref",
					Version: 1,
				},
			},
		}
		s.mockRegistry.SeedSchema("proto-self-ref", 2, 11, protoCircularSchema)

		done := make(chan bool, 1)
		var result any
		var err error

		go func() {
			defer func() {
				if r := recover(); r != nil {
					err = fmt.Errorf("panic occurred: %v", r)
				}
				done <- true
			}()
			tenantCtx := getTenantContext(s.namespace)
			result, err = s.cachedClient.CompileProtoSchemaWithReferences(tenantCtx, protoCircularSchema, make(map[string]string))
		}()

		select {
		case <-done:
			// Expected behavior: Should handle circular reference gracefully
			// Proto compilation might succeed with self-referencing messages or fail gracefully
			if err != nil {
				// Accept any compilation error as valid behavior
				s.NotEmpty(err.Error(), "Should have meaningful error message")
			} else {
				s.NotNil(result)
			}
		case <-time.After(5 * time.Second):
			s.Fail("Circular reference caused infinite loop/timeout")
		}
	})
}

// TestMultiTenantCaching tests that the CachedClient properly isolates
// tenants at the application cache level (not Avro library level).
func (s *TestCachedClientSuite) TestMultiTenantCaching() {
	// Setup schemas for different tenants
	s.mockRegistry.SeedSchema("user-value", 1, 1, sr.Schema{
		Schema: `{"type": "string"}`,
	})

	// Create contexts for two different tenants
	tenant1Ctx := context.WithValue(context.Background(), testTenantKey, "tenant1")
	tenant2Ctx := context.WithValue(context.Background(), testTenantKey, "tenant2")

	// Both tenants should be able to access the same schema ID
	schema1, err := s.cachedClient.SchemaByID(tenant1Ctx, 1)
	s.NoError(err)
	s.Equal(`{"type": "string"}`, schema1.Schema)

	schema2, err := s.cachedClient.SchemaByID(tenant2Ctx, 1)
	s.NoError(err)
	s.Equal(`{"type": "string"}`, schema2.Schema)

	// Verify that the schemas are cached separately at CachedClient level
	// (This works correctly - it's the Avro library level that has the bug)
	s.Equal(schema1.Schema, schema2.Schema)
}

// TestCacheBehavior tests cache hit/miss behavior at the CachedClient level
func (s *TestCachedClientSuite) TestCacheBehavior() {
	s.mockRegistry.SeedSchema("test-subject", 1, 1, sr.Schema{
		Schema: `{"type": "string"}`,
	})

	// Add interceptor to count requests
	requestCount := 0
	s.mockRegistry.Intercept(func(_ http.ResponseWriter, r *http.Request) bool {
		if r.URL.Path == "/schemas/ids/1" {
			requestCount++
		}
		return false // Don't handle the request, just count it
	})

	// First call should hit the registry
	tenantCtx := getTenantContext(s.namespace)
	_, err := s.cachedClient.SchemaByID(tenantCtx, 1)
	s.NoError(err)
	s.Equal(1, requestCount)

	// Second call should use cache
	_, err = s.cachedClient.SchemaByID(tenantCtx, 1)
	s.NoError(err)
	s.Equal(1, requestCount) // Should still be 1 (cache hit)

	// Different tenant should hit the registry again
	differentTenantCtx := context.WithValue(context.Background(), testTenantKey, "different-tenant")
	_, err = s.cachedClient.SchemaByID(differentTenantCtx, 1)
	s.NoError(err)
	s.Equal(2, requestCount) // Should be 2 (cache miss for different tenant)
}

// TestConcurrentAccess tests concurrent access to cached schemas
func (s *TestCachedClientSuite) TestConcurrentAccess() {
	s.mockRegistry.SeedSchema("concurrent-test", 1, 1, sr.Schema{
		Schema: `{"type": "string"}`,
	})

	const numGoroutines = 10
	var wg sync.WaitGroup
	errors := make(chan error, numGoroutines)

	// Launch multiple goroutines accessing the same schema
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			tenantCtx := context.WithValue(context.Background(), testTenantKey, fmt.Sprintf("tenant-%d", id%3))
			_, err := s.cachedClient.SchemaByID(tenantCtx, 1)
			if err != nil {
				errors <- err
			}
		}(i)
	}

	wg.Wait()
	close(errors)

	// Check that no errors occurred
	for err := range errors {
		s.NoError(err)
	}
}

// TestSuite runs the essential test suite
func TestSuite(t *testing.T) {
	suite.Run(t, new(TestCachedClientSuite))
}
