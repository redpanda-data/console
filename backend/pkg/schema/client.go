// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package schema provides a comprehensive caching layer for schema management
// across various formats including Avro, Protobuf, and JSON. It leverages
// the schema registry to fetch and parse schemas, optimizing performance by
// caching schemas and their references. The package supports operations such as
// fetching schemas by ID or version, parsing schemas with their dependencies,
// and compiling schemas into formats ready for use in serialization and
// deserialization processes.
package schema

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/bufbuild/protocompile"
	"github.com/bufbuild/protocompile/linker"
	"github.com/hamba/avro/v2"
	"github.com/santhosh-tekuri/jsonschema/v5"
	"github.com/twmb/franz-go/pkg/sr"
	"github.com/twmb/go-cache/cache"

	"github.com/redpanda-data/console/backend/pkg/factory/schema"
)

const mainProtoFilename = "__console_tmp.proto"

// CachedClient provides schema management with caching for efficient reuse.
// It retrieves and parses Avro, Protobuf, and JSON schemas from a Schema Registry,
// utilizing in-memory caches to minimize redundant fetches and compilations.
type CachedClient struct {
	schemaClientFactory schema.ClientFactory
	cacheNamespace      func(context.Context) string

	schemaCache        *cache.Cache[string, sr.Schema]
	subjectSchemaCache *cache.Cache[string, sr.SubjectSchema]

	avroSchemaCache  *cache.Cache[string, avro.Schema]
	protoSchemaCache *cache.Cache[string, linker.Files]
}

// NewCachedClient initializes and returns a new CachedClient instance with the
// provided schema client factory and cache namespace function. It sets up
// caching with specific settings.
func NewCachedClient(schemaClientFactory schema.ClientFactory, cacheNamespaceFn func(context.Context) string) *CachedClient {
	cacheSettings := []cache.Opt{
		cache.MaxAge(30 * time.Second),
		cache.MaxErrorAge(time.Second),
	}

	return &CachedClient{
		schemaClientFactory: schemaClientFactory,
		cacheNamespace:      cacheNamespaceFn,

		schemaCache: cache.New[string, sr.Schema](cacheSettings...),
	}
}

// AvroSchemaByID retrieves and parses an Avro schema by its ID, using a cached
// value if available. If the schema isn't cached, it fetches the schema, parses
// it with references, and stores the result in the cache.
func (c *CachedClient) AvroSchemaByID(ctx context.Context, id int) (avro.Schema, error) {
	key := c.cacheNamespace(ctx) + "/avro-parsed-schemas/ids/" + strconv.Itoa(id)

	avroSch, err, _ := c.avroSchemaCache.Get(key, func() (avro.Schema, error) {
		sch, err := c.SchemaByID(ctx, id)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch schema from schema registry: %w", err)
		}

		avroSch, err := c.ParseAvroSchemaWithReferences(ctx, sch, &avro.SchemaCache{})
		if err != nil {
			return nil, fmt.Errorf("failed to parse avro schema: %w", err)
		}

		return avroSch, nil
	})

	return avroSch, err
}

// ProtoFilesByID retrieves and compiles the protobuf schema associated with the given schema ID.
// It first checks if the compiled schema is cached; if not, it fetches the schema by ID,
// compiles it along with any referenced schemas, and caches the result.
func (c *CachedClient) ProtoFilesByID(ctx context.Context, id int) (linker.Files, string, error) {
	key := c.cacheNamespace(ctx) + "/proto-files/ids/" + strconv.Itoa(id)

	compiledProtoFiles, err, _ := c.protoSchemaCache.Get(key, func() (linker.Files, error) {
		sch, err := c.SchemaByID(ctx, id)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch schema from schema registry: %w", err)
		}

		protoFiles, err := c.CompileProtoSchemaWithReferences(ctx, sch, make(map[string]string))
		if err != nil {
			return nil, fmt.Errorf("failed to compile proto schema: %w", err)
		}

		return protoFiles, nil
	})

	return compiledProtoFiles, mainProtoFilename, err
}

// CompileProtoSchemaWithReferences compiles the given schema and its referenced schemas into protobuf files.
// It recursively loads all schema references into an accessor map, which is then used by the protobuf compiler.
func (c *CachedClient) CompileProtoSchemaWithReferences(
	ctx context.Context,
	schema sr.Schema,
	accessorMap map[string]string,
) (linker.Files, error) {
	// Helper function to recursively fetch and parse all schema references.
	var loadReferencesFn func(s sr.Schema) error
	loadReferencesFn = func(s sr.Schema) error {
		for _, ref := range s.References {
			schemaRef, err := c.SchemaByVersion(ctx, ref.Subject, ref.Version)
			if err != nil {
				return err
			}
			accessorMap[ref.Name] = schemaRef.Schema.Schema

			if err := loadReferencesFn(schemaRef.Schema); err != nil {
				return fmt.Errorf("failed to parse reference schema %q: %w", ref.Subject, err)
			}
		}
		return nil
	}

	// Load all references into accessorMap before proceeding.
	if err := loadReferencesFn(schema); err != nil {
		return nil, err
	}

	// Add the main schema to the accessorMap with a temporary filename.
	accessorMap[mainProtoFilename] = schema.Schema

	// Compile the schema using the provided compiler.
	compiler := protocompile.Compiler{
		Resolver: &protocompile.SourceResolver{
			Accessor: protocompile.SourceAccessorFromMap(accessorMap),
		},
		SourceInfoMode: protocompile.SourceInfoStandard,
	}

	compiled, err := compiler.Compile(ctx, mainProtoFilename)
	if err != nil {
		return nil, fmt.Errorf("unable to compile the given schema: %w", err)
	}

	return compiled, nil
}

// ParseAvroSchemaWithReferences parses an avro schema that potentially has references
// to other schemas. References will be resolved by requesting and parsing them
// recursively. If any of the referenced schemas can't be fetched or parsed an
// error will be returned.
func (c *CachedClient) ParseAvroSchemaWithReferences(ctx context.Context, schema sr.Schema, schemaCache *avro.SchemaCache) (avro.Schema, error) {
	if len(schema.References) == 0 {
		return avro.Parse(schema.Schema)
	}

	// Fetch and parse all schema references recursively. All schemas that have
	// been parsed successfully will be cached by the avro library.
	for _, reference := range schema.References {
		schemaRef, err := c.SchemaByVersion(ctx, reference.Subject, reference.Version)
		if err != nil {
			return nil, err
		}

		if _, err := c.ParseAvroSchemaWithReferences(
			ctx,
			schemaRef.Schema,
			schemaCache,
		); err != nil {
			return nil, fmt.Errorf(
				"failed to parse schema reference (subject: %q, version %d): %w",
				reference.Subject, reference.Version, err,
			)
		}
	}

	// Parse the main schema in the end after solving all references
	return avro.ParseWithCache(schema.Schema, "", schemaCache)
}

// ParseJSONSchema compiles a JSON schema using a schema registry schema (sr.Schema).
// It initializes a new JSON schema compiler, builds the schema with references,
// and compiles it into a jsonschema.Schema instance.
// Returns the compiled JSON schema or an error if the schema compilation fails.
func (c *CachedClient) ParseJSONSchema(ctx context.Context, sch sr.Schema) (*jsonschema.Schema, error) {
	compiler := jsonschema.NewCompiler()
	schemaName := "redpanda_jsonschema.json"

	err := c.buildJSONSchemaWithReferences(ctx, compiler, schemaName, sch)
	if err != nil {
		return nil, err
	}

	return compiler.Compile(schemaName)
}

// buildJSONSchemaWithReferences adds a schema and its references to the provided JSON schema compiler.
// It iterates through all references in the schema, fetching and recursively adding them to the compiler.
// Returns an error if any of the schema resources or references fail to be added.
func (c *CachedClient) buildJSONSchemaWithReferences(ctx context.Context, compiler *jsonschema.Compiler, name string, sch sr.Schema) error {
	if err := compiler.AddResource(name, strings.NewReader(sch.Schema)); err != nil {
		return err
	}

	for _, reference := range sch.References {
		schemaRef, err := c.SchemaByVersion(ctx, reference.Subject, reference.Version)
		if err != nil {
			return err
		}
		if err := compiler.AddResource(reference.Name, strings.NewReader(schemaRef.Schema.Schema)); err != nil {
			return err
		}
		if err := c.buildJSONSchemaWithReferences(ctx, compiler, reference.Name, schemaRef.Schema); err != nil {
			return err
		}
	}

	return nil
}

// SchemaByID fetches a schema by its ID from the schema registry, utilizing a
// cached value if available. If the schema isn't cached, it is fetched from the
// schema registry and stored in the cache.
func (c *CachedClient) SchemaByID(ctx context.Context, id int) (sr.Schema, error) {
	key := c.cacheNamespace(ctx) + "/schemas/ids/" + strconv.Itoa(id)

	sch, err, _ := c.schemaCache.Get(key, func() (sr.Schema, error) {
		srClient, err := c.schemaClientFactory.GetSchemaRegistryClient(ctx)
		if err != nil {
			return sr.Schema{}, err
		}
		return srClient.SchemaByID(ctx, id)
	})

	return sch, err
}

// SchemaByVersion retrieves a schema by its subject and version from the schema
// registry, using a cached value if available. If not cached, it fetches the
// schema from the registry and stores it in the cache.
func (c *CachedClient) SchemaByVersion(ctx context.Context, subject string, id int) (sr.SubjectSchema, error) {
	key := c.cacheNamespace(ctx) + fmt.Sprintf("/subjects/%v/versions/%d", subject, id)

	sch, err, _ := c.subjectSchemaCache.Get(key, func() (sr.SubjectSchema, error) {
		srClient, err := c.schemaClientFactory.GetSchemaRegistryClient(ctx)
		if err != nil {
			return sr.SubjectSchema{}, err
		}
		return srClient.SchemaByVersion(ctx, subject, id)
	})

	return sch, err
}
