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
	"bytes"
	"context"
	"fmt"
	"io/fs"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/bufbuild/protocompile"
	"github.com/bufbuild/protocompile/linker"
	"github.com/hamba/avro/v2"
	"github.com/santhosh-tekuri/jsonschema/v5"
	"github.com/twmb/franz-go/pkg/sr"
	"github.com/twmb/go-cache/cache"
	"google.golang.org/protobuf/reflect/protoreflect"

	"github.com/redpanda-data/console/backend/pkg/factory/schema"
	"github.com/redpanda-data/console/backend/pkg/proto/embed"
)

const mainProtoFilename = "__console_tmp.proto"

// CachedClient provides schema management with caching for efficient reuse.
// It retrieves and parses Avro, Protobuf, and JSON schemas from a Schema Registry,
// utilizing in-memory caches to minimize redundant fetches and compilations.
type CachedClient struct {
	schemaClientFactory schema.ClientFactory
	// cacheNamespace returns a unique tenant identifier for resource cache isolation.
	// Used to generate cache keys like "{namespace}/avro-parsed-schemas/ids/{id}" for
	// multi-tenant environments where compiled schemas must be isolated per tenant.
	cacheNamespace func(context.Context) (string, error)

	standardImportsResolver func(protocompile.Resolver) protocompile.Resolver

	schemaCache        *cache.Cache[string, sr.Schema]
	subjectSchemaCache *cache.Cache[string, sr.SubjectSchema]

	avroSchemaCache  *cache.Cache[string, avro.Schema]
	protoSchemaCache *cache.Cache[string, linker.Files]
	jsonSchemaCache  *cache.Cache[string, *jsonschema.Schema]
}

// Client defines the interface for a schema client implementation.
type Client interface {
	AvroSchemaByID(ctx context.Context, id int) (avro.Schema, error)
	ProtoFilesByID(ctx context.Context, id int) (linker.Files, string, error)
	JSONSchemaByID(ctx context.Context, id int) (*jsonschema.Schema, error)
	ParseAvroSchemaWithReferences(ctx context.Context, schema sr.Schema) (avro.Schema, error)
	ParseJSONSchema(ctx context.Context, sch sr.Schema) (*jsonschema.Schema, error)
	SchemaByID(ctx context.Context, id int) (sr.Schema, error)
	SchemaByVersion(ctx context.Context, subject string, id int) (sr.SubjectSchema, error)
}

// Ensure CachedClient implements the Client interface.
var _ Client = (*CachedClient)(nil)

// NewCachedClient initializes and returns a new CachedClient instance with the
// provided schema client factory and cache namespace function. It sets up
// caching with specific settings for compiled schema resources.
//
// The cacheNamespaceFn should return a unique tenant identifier (e.g., virtual cluster ID,
// tenant ID) for multi-tenant resource isolation. This ensures compiled schemas are
// cached separately per tenant, preventing cross-tenant data leakage.
func NewCachedClient(schemaClientFactory schema.ClientFactory, cacheNamespaceFn func(context.Context) (string, error)) (*CachedClient, error) {
	cacheSettings := []cache.Opt{
		cache.MaxAge(30 * time.Second),
		cache.MaxErrorAge(time.Second),
	}

	standardImportsResolver, err := createCustomProtoResolver(context.Background())
	if err != nil {
		return nil, err
	}

	return &CachedClient{
		schemaClientFactory: schemaClientFactory,
		cacheNamespace:      cacheNamespaceFn,

		standardImportsResolver: standardImportsResolver,

		schemaCache:        cache.New[string, sr.Schema](cacheSettings...),
		subjectSchemaCache: cache.New[string, sr.SubjectSchema](cacheSettings...),

		avroSchemaCache:  cache.New[string, avro.Schema](cacheSettings...),
		protoSchemaCache: cache.New[string, linker.Files](cacheSettings...),
		jsonSchemaCache:  cache.New[string, *jsonschema.Schema](cacheSettings...),
	}, nil
}

// createCustomProtoResolver compiles embedded .proto files into file
// descriptors and returns a resolver function that prioritizes resolving proto
// files from the embedded filesystem. If a file is not found in the embedded
// filesystem, it defers to the external resolver. An error is returned if
// there's an issue reading or compiling the embedded proto files.
func createCustomProtoResolver(ctx context.Context) (func(protocompile.Resolver) protocompile.Resolver, error) {
	protoFilesFs, err := fs.Sub(embed.ProtobufStandardSchemas, "protobuf")
	if err != nil {
		return nil, fmt.Errorf("failed to load embedded proto files: %w", err)
	}
	protoFilepaths := make([]string, 0)

	// Walk through the embedded FS to find .proto files
	err = fs.WalkDir(protoFilesFs, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && filepath.Ext(path) == ".proto" {
			protoFilepaths = append(protoFilepaths, path)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// Use protocompile.Compiler to compile the .proto files into descriptors
	resolveFromEmbeddedProtosFn := protocompile.ResolverFunc(func(name string) (protocompile.SearchResult, error) {
		data, err := fs.ReadFile(protoFilesFs, name)
		if err != nil {
			return protocompile.SearchResult{}, fmt.Errorf("file not found: %s", name)
		}
		return protocompile.SearchResult{Source: bytes.NewReader(data)}, nil
	})
	compiler := protocompile.Compiler{
		Resolver:       protocompile.WithStandardImports(resolveFromEmbeddedProtosFn),
		SourceInfoMode: protocompile.SourceInfoNone,
	}

	// Compile proto files and store them by filepath so that we can refer to them
	// in the proto resolver
	descriptors, err := compiler.Compile(ctx, protoFilepaths...)
	if err != nil {
		return nil, fmt.Errorf("failed to compile proto files: %w", err)
	}

	descriptorsByPath := make(map[string]protoreflect.FileDescriptor, len(protoFilepaths))
	for _, desc := range descriptors {
		descriptorsByPath[desc.Path()] = desc
	}

	// withEmbeddedProtoResolver is a resolver that checks the embedded proto files for descriptors.
	withEmbeddedProtoResolver := func(r protocompile.Resolver) protocompile.Resolver {
		return protocompile.ResolverFunc(func(name string) (protocompile.SearchResult, error) {
			res, err := r.FindFileByPath(name)
			if err != nil {
				// error from given resolver? see if it's a known standard file
				if desc, ok := descriptorsByPath[name]; ok {
					return protocompile.SearchResult{Desc: desc}, nil
				}
			}

			// if not found in embedded files, defer to the provided resolver
			return res, err
		})
	}

	return withEmbeddedProtoResolver, nil
}

// AvroSchemaByID retrieves and parses an Avro schema by its ID, using a cached
// value if available. If the schema isn't cached, it fetches the schema, parses
// it with references, and stores the result in the cache.
func (c *CachedClient) AvroSchemaByID(ctx context.Context, id int) (avro.Schema, error) {
	namespace, err := c.cacheNamespace(ctx)
	if err != nil {
		return nil, err
	}

	key := namespace + "/avro-parsed-schemas/ids/" + strconv.Itoa(id)

	avroSch, err, _ := c.avroSchemaCache.Get(key, func() (avro.Schema, error) {
		sch, err := c.SchemaByID(ctx, id)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch schema from schema registry: %w", err)
		}

		// Use temporary cache for reference resolution - prevents cross-tenant leakage
		// The temporary cache is discarded after parsing, providing isolation
		avroSch, err := c.ParseAvroSchemaWithReferences(ctx, sch)
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
	namespace, err := c.cacheNamespace(ctx)
	if err != nil {
		return nil, "", err
	}

	key := namespace + "/proto-files/ids/" + strconv.Itoa(id)

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

// JSONSchemaByID retrieves and compiles a JSON schema by its ID, using a cached
// value if available. If the schema isn't cached, it fetches the schema, compiles
// it with references, and stores the result in the cache.
func (c *CachedClient) JSONSchemaByID(ctx context.Context, id int) (*jsonschema.Schema, error) {
	namespace, err := c.cacheNamespace(ctx)
	if err != nil {
		return nil, err
	}

	key := namespace + "/json-compiled-schemas/ids/" + strconv.Itoa(id)

	jsonSch, err, _ := c.jsonSchemaCache.Get(key, func() (*jsonschema.Schema, error) {
		sch, err := c.SchemaByID(ctx, id)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch schema from schema registry: %w", err)
		}

		compiledSchema, err := c.ParseJSONSchema(ctx, sch)
		if err != nil {
			return nil, fmt.Errorf("failed to parse JSON schema: %w", err)
		}

		return compiledSchema, nil
	})

	return jsonSch, err
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
	sourceResolver := &protocompile.SourceResolver{
		Accessor: protocompile.SourceAccessorFromMap(accessorMap),
	}
	compiler := protocompile.Compiler{
		Resolver:       protocompile.WithStandardImports(c.standardImportsResolver(sourceResolver)),
		SourceInfoMode: protocompile.SourceInfoNone,
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
func (c *CachedClient) ParseAvroSchemaWithReferences(ctx context.Context, schema sr.Schema) (avro.Schema, error) {
	// Create temporary cache for this parsing operation to avoid cross-tenant leakage
	// The cache is only used during parsing to resolve references and is discarded after
	tempCache := &avro.SchemaCache{}
	return c.parseAvroSchemaWithStack(ctx, schema, tempCache, make(map[string]bool))
}

// parseAvroSchemaWithStack parses an avro schema with circular reference protection.
// It uses a parsing stack to detect circular dependencies and prevent infinite recursion.
func (c *CachedClient) parseAvroSchemaWithStack(ctx context.Context, schema sr.Schema, schemaCache *avro.SchemaCache, parsingStack map[string]bool) (avro.Schema, error) {
	// Fetch and parse all schema references recursively.
	for _, reference := range schema.References {
		refKey := fmt.Sprintf("%s:%d", reference.Subject, reference.Version)
		if parsingStack[refKey] {
			return nil, fmt.Errorf("circular reference detected: schema %s references itself", refKey)
		}

		schemaRef, err := c.SchemaByVersion(ctx, reference.Subject, reference.Version)
		if err != nil {
			return nil, err
		}

		parsingStack[refKey] = true

		// The `avro.ParseWithCache` call below will add the referenced types to the cache.
		// So we just need to recurse to ensure all dependencies are resolved first.
		if _, err := c.parseAvroSchemaWithStack(
			ctx,
			schemaRef.Schema,
			schemaCache,
			parsingStack,
		); err != nil {
			return nil, fmt.Errorf(
				"failed to parse schema reference (subject: %q, version %d): %w",
				reference.Subject, reference.Version, err,
			)
		}

		delete(parsingStack, refKey) // Use delete for clarity
	}

	// This single call correctly parses the current schema and uses the cache.
	// It works whether the schema has references or not.
	// It adds any named types within this schema to the cache for others to use.
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
	namespace, err := c.cacheNamespace(ctx)
	if err != nil {
		return sr.Schema{}, err
	}

	key := namespace + "/schemas/ids/" + strconv.Itoa(id)

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
	namespace, err := c.cacheNamespace(ctx)
	if err != nil {
		return sr.SubjectSchema{}, err
	}

	key := namespace + fmt.Sprintf("/subjects/%v/versions/%d", subject, id)

	sch, err, _ := c.subjectSchemaCache.Get(key, func() (sr.SubjectSchema, error) {
		srClient, err := c.schemaClientFactory.GetSchemaRegistryClient(ctx)
		if err != nil {
			return sr.SubjectSchema{}, err
		}
		return srClient.SchemaByVersion(ctx, subject, id)
	})

	return sch, err
}
