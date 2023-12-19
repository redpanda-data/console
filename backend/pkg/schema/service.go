// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package schema

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/hamba/avro/v2"
	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/desc/protoparse"
	"github.com/santhosh-tekuri/jsonschema/v5"
	"github.com/twmb/go-cache/cache"
	"go.uber.org/zap"
	"golang.org/x/sync/singleflight"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/schema/embed"
)

// Service for fetching schemas from a schema registry. It has to provide an interface for other packages which is safe
// for concurrent access and also takes care of caching schemas.
type Service struct {
	cfg          config.Schema
	logger       *zap.Logger
	requestGroup singleflight.Group

	registryClient *Client

	// schemaBySubjectVersion caches schema response by subject and version. Caching schemas
	// by subjects is needed to lookup references in avro schemas.
	schemaBySubjectVersion *cache.Cache[string, *SchemaVersionedResponse]
	avroSchemaByID         *cache.Cache[uint32, avro.Schema]
}

// NewService to access schema registry. Returns an error if connection can't be established.
func NewService(cfg config.Schema, logger *zap.Logger) (*Service, error) {
	client, err := newClient(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create schema registry client: %w", err)
	}

	return &Service{
		cfg:                    cfg,
		logger:                 logger,
		requestGroup:           singleflight.Group{},
		registryClient:         client,
		avroSchemaByID:         cache.New[uint32, avro.Schema](cache.MaxAge(5*time.Minute), cache.MaxErrorAge(time.Second)),
		schemaBySubjectVersion: cache.New[string, *SchemaVersionedResponse](cache.MaxAge(5*time.Minute), cache.MaxErrorAge(time.Second)),
	}, nil
}

// CheckConnectivity to schema registry. Returns no error if connectivity is fine.
func (s *Service) CheckConnectivity(ctx context.Context) error {
	return s.registryClient.CheckConnectivity(ctx)
}

// GetProtoDescriptors returns all file descriptors in a map where the key is the schema id.
// The value is a set of file descriptors because each schema may references / imported proto schemas.
func (s *Service) GetProtoDescriptors(ctx context.Context) (map[int]*desc.FileDescriptor, error) {
	// Singleflight makes sure to not run the function body if there are concurrent requests. We use this to avoid
	// duplicate requests against the schema registry
	key := "get-proto-descriptors"
	v, err, _ := s.requestGroup.Do(key, func() (any, error) {
		schemasRes, err := s.registryClient.GetSchemas(ctx, false)
		if err != nil {
			// If schema registry returns an error we want to retry it next time, so let's forget the key
			s.requestGroup.Forget(key)
			return nil, fmt.Errorf("failed to get schema from registry: %w", err)
		}

		// 1. Index all returned schemas by their respective subject name and version as stored in the schema registry
		schemasBySubjectAndVersion := make(map[string]map[int]SchemaVersionedResponse)
		for _, schema := range schemasRes {
			if schema.Type != TypeProtobuf {
				continue
			}
			_, exists := schemasBySubjectAndVersion[schema.Subject]
			if !exists {
				schemasBySubjectAndVersion[schema.Subject] = make(map[int]SchemaVersionedResponse)
			}
			schemasBySubjectAndVersion[schema.Subject][schema.Version] = schema
		}

		// 2. Compile each subject with each of it's references into one or more filedescriptors so that they can be
		// registered in their own proto registry.
		fdBySchemaID := make(map[int]*desc.FileDescriptor)
		for _, schema := range schemasRes {
			if schema.Type != TypeProtobuf {
				continue
			}

			fd, err := s.compileProtoSchemas(schema, schemasBySubjectAndVersion)
			if err != nil {
				s.logger.Warn("failed to compile proto schema",
					zap.String("subject", schema.Subject),
					zap.Int("schema_id", schema.SchemaID),
					zap.Error(err))
				continue
			}
			fdBySchemaID[schema.SchemaID] = fd
		}

		return fdBySchemaID, nil
	})
	if err != nil {
		return nil, err
	}

	descriptors := v.(map[int]*desc.FileDescriptor)

	return descriptors, nil
}

func (s *Service) addReferences(schema SchemaVersionedResponse, schemaRepository map[string]map[int]SchemaVersionedResponse, schemasByPath map[string]string) error {
	for _, ref := range schema.References {
		refSubject, exists := schemaRepository[ref.Subject]
		if !exists {
			return fmt.Errorf("failed to resolve reference. Reference with subject '%s' does not exist", ref.Subject)
		}
		refSchema, exists := refSubject[ref.Version]
		if !exists {
			return fmt.Errorf("failed to resolve reference. Reference with subject '%s', version '%d' does not exist", ref.Subject, ref.Version)
		}
		// The reference name is the name that has been used for the import in the proto schema (e.g. 'customer.proto')
		schemasByPath[ref.Name] = refSchema.Schema

		err := s.addReferences(refSchema, schemaRepository, schemasByPath)
		if err != nil {
			return err
		}
	}

	return nil
}

func (s *Service) compileProtoSchemas(schema SchemaVersionedResponse, schemaRepository map[string]map[int]SchemaVersionedResponse) (*desc.FileDescriptor, error) {
	// 1. Let's find the references for each schema and put the references' schemas into our in memory filesystem.
	schemasByPath := make(map[string]string)
	schemasByPath[schema.Subject] = schema.Schema
	err := s.addReferences(schema, schemaRepository, schemasByPath)
	if err != nil {
		return nil, err
	}

	// 2. Add common proto types
	// The well known types are automatically added in the protoreflect protoparse package.
	// But we need to support the other types Redpanda automatically includes.
	// These are added in the embed package, and here we add them to the map for parsing.
	commonProtoMap, err := embed.CommonProtoFileMap()
	if err != nil {
		return nil, fmt.Errorf("failed to load common protobuf types: %w", err)
	}

	for commonPath, commonSchema := range commonProtoMap {
		if _, exists := schemasByPath[commonPath]; !exists {
			schemasByPath[commonPath] = commonSchema
		}
	}

	// 3. Parse schema to descriptor file
	errorReporter := func(err protoparse.ErrorWithPos) error {
		position := err.GetPosition()
		s.logger.Warn("failed to parse proto schema to descriptor",
			zap.String("file", position.Filename),
			zap.Int("line", position.Line),
			zap.Error(err))
		return nil
	}

	parser := protoparse.Parser{
		Accessor:              protoparse.FileContentsFromMap(schemasByPath),
		InferImportPaths:      true,
		ValidateUnlinkedFiles: true,
		IncludeSourceCodeInfo: true,
		ErrorReporter:         errorReporter,
	}
	descriptors, err := parser.ParseFiles(schema.Subject)
	if err != nil {
		return nil, fmt.Errorf("failed to parse proto files to descriptors: %w", err)
	}
	return descriptors[0], nil
}

// IsEnabled returns whether the schema registry is enabled in configuration.
func (s *Service) IsEnabled() bool {
	return s.cfg.Enabled
}

// GetAvroSchemaByID loads the schema by the given schemaID and tries to parse the schema
// contents to an avro.Schema, so that it can be used for decoding Avro encoded messages.
func (s *Service) GetAvroSchemaByID(ctx context.Context, schemaID uint32) (avro.Schema, error) {
	codecCached, err, _ := s.avroSchemaByID.Get(schemaID, func() (avro.Schema, error) {
		schemaRes, err := s.registryClient.GetSchemaByID(ctx, schemaID)
		if err != nil {
			s.logger.Warn("failed to fetch avro schema", zap.Uint32("schema_id", schemaID), zap.Error(err))
			return nil, fmt.Errorf("failed to get schema from registry: %w", err)
		}

		codec, err := s.ParseAvroSchemaWithReferences(ctx, schemaRes, avro.DefaultSchemaCache)
		if err != nil {
			return nil, fmt.Errorf("failed to parse schema: %w", err)
		}

		return codec, nil
	})

	return codecCached, err
}

// GetSubjects returns a list of all deployed schemas.
func (s *Service) GetSubjects(ctx context.Context, showSoftDeleted bool) (*SubjectsResponse, error) {
	return s.registryClient.GetSubjects(ctx, showSoftDeleted)
}

// GetSchemaTypes returns supported types (AVRO, PROTOBUF, JSON)
func (s *Service) GetSchemaTypes(ctx context.Context) ([]string, error) {
	return s.registryClient.GetSchemaTypes(ctx)
}

// GetSubjectVersions returns a schema subject's registered versions.
func (s *Service) GetSubjectVersions(ctx context.Context, subject string, showSoftDeleted bool) (*SubjectVersionsResponse, error) {
	return s.registryClient.GetSubjectVersions(ctx, subject, showSoftDeleted)
}

// GetSchemaBySubject returns the schema for the specified version of this subject.
func (s *Service) GetSchemaBySubject(ctx context.Context, subject, version string, showSoftDeleted bool) (*SchemaVersionedResponse, error) {
	return s.registryClient.GetSchemaBySubject(ctx, subject, version, showSoftDeleted)
}

// GetMode returns the current mode for Schema Registry at a global level.
func (s *Service) GetMode(ctx context.Context) (*ModeResponse, error) {
	return s.registryClient.GetMode(ctx)
}

// GetConfig gets global compatibility level.
func (s *Service) GetConfig(ctx context.Context) (*ConfigResponse, error) {
	return s.registryClient.GetConfig(ctx)
}

// PutConfig sets the global compatibility level.
func (s *Service) PutConfig(ctx context.Context, compatLevel CompatibilityLevel) (*PutConfigResponse, error) {
	return s.registryClient.PutConfig(ctx, compatLevel)
}

// GetSubjectConfig gets compatibility level for a given subject.
func (s *Service) GetSubjectConfig(ctx context.Context, subject string) (*ConfigResponse, error) {
	return s.registryClient.GetSubjectConfig(ctx, subject)
}

// PutSubjectConfig puts compatibility level for a given subject.
func (s *Service) PutSubjectConfig(ctx context.Context, subject string, compatLevel CompatibilityLevel) (*PutConfigResponse, error) {
	return s.registryClient.PutSubjectConfig(ctx, subject, compatLevel)
}

// DeleteSubjectConfig puts compatibility level for a given subject.
func (s *Service) DeleteSubjectConfig(ctx context.Context, subject string) (*ConfigResponse, error) {
	return s.registryClient.DeleteSubjectConfig(ctx, subject)
}

// DeleteSubject deletes a schema registry subject.
func (s *Service) DeleteSubject(ctx context.Context, subject string, deletePermanently bool) (*DeleteSubjectResponse, error) {
	return s.registryClient.DeleteSubject(ctx, subject, deletePermanently)
}

// DeleteSubjectVersion deletes a specific version for a schema registry subject.
func (s *Service) DeleteSubjectVersion(ctx context.Context, subject, version string, deletePermanently bool) (*DeleteSubjectVersionResponse, error) {
	return s.registryClient.DeleteSubjectVersion(ctx, subject, version, deletePermanently)
}

// GetSchemaReferences returns all schema ids that references the input
// subject-version. You can use -1 or 'latest' to check the latest version.
func (s *Service) GetSchemaReferences(ctx context.Context, subject, version string) (*GetSchemaReferencesResponse, error) {
	return s.registryClient.GetSchemaReferences(ctx, subject, version)
}

// CheckCompatibility checks if a schema is compatible with the given version
// that exists. You can use 'latest' to check compatibility with the latest version.
func (s *Service) CheckCompatibility(ctx context.Context, subject string, version string, schema Schema) (*CheckCompatibilityResponse, error) {
	return s.registryClient.CheckCompatibility(ctx, subject, version, schema)
}

// GetSchemaByID gets the schema by ID.
func (s *Service) GetSchemaByID(ctx context.Context, id uint32) (*SchemaResponse, error) {
	return s.registryClient.GetSchemaByID(ctx, id)
}

// ParseAvroSchemaWithReferences parses an avro schema that potentially has references
// to other schemas. References will be resolved by requesting and parsing them
// recursively. If any of the referenced schemas can't be fetched or parsed an
// error will be returned.
func (s *Service) ParseAvroSchemaWithReferences(ctx context.Context, schema *SchemaResponse, schemaCache *avro.SchemaCache) (avro.Schema, error) {
	if len(schema.References) == 0 {
		return avro.Parse(schema.Schema)
	}

	// Fetch and parse all schema references recursively. All schemas that have
	// been parsed successfully will be cached by the avro library.
	for _, reference := range schema.References {
		schemaRef, err := s.GetSchemaBySubjectAndVersion(ctx, reference.Subject, strconv.Itoa(reference.Version))
		if err != nil {
			return nil, err
		}

		if _, err := s.ParseAvroSchemaWithReferences(
			ctx,
			&SchemaResponse{
				Schema:     schemaRef.Schema,
				References: schemaRef.References,
			},
			schemaCache,
		); err != nil {
			return nil, fmt.Errorf(
				"failed to parse schema reference (subject: %q, version %q): %w",
				reference.Subject, reference.Version, err,
			)
		}
	}

	// Parse the main schema in the end after solving all references
	return avro.Parse(schema.Schema)
}

// ValidateAvroSchema tries to parse the given avro schema with the avro library.
// If there's an issue with the given schema, it will be returned to the user
// so that they can fix the schema string.
func (s *Service) ValidateAvroSchema(ctx context.Context, sch Schema) error {
	tempCache := avro.SchemaCache{}
	schemaRes := &SchemaResponse{Schema: sch.Schema, References: sch.References}
	_, err := s.ParseAvroSchemaWithReferences(ctx, schemaRes, &tempCache)
	return err
}

// ValidateJSONSchema validates a JSON schema for syntax issues.
func (s *Service) ValidateJSONSchema(ctx context.Context, name string, sch Schema, schemaCompiler *jsonschema.Compiler) error {
	if schemaCompiler == nil {
		schemaCompiler = jsonschema.NewCompiler()
	}

	for _, ref := range sch.References {
		schemaRefRes, err := s.GetSchemaBySubjectAndVersion(ctx, ref.Subject, strconv.Itoa(ref.Version))
		if err != nil {
			return fmt.Errorf("failed to retrieve reference %q: %w", ref.Subject, err)
		}
		schemaRef := Schema{
			Schema:     schemaRefRes.Schema,
			Type:       schemaRefRes.Type,
			References: nil,
		}
		if err := s.ValidateJSONSchema(ctx, ref.Name, schemaRef, schemaCompiler); err != nil {
			return err
		}
	}

	// Prevent a panic by the schema compiler by checking the name before AddResource
	if strings.IndexByte(name, '#') != -1 {
		return fmt.Errorf("hashtags are not allowed as part of the schema name")
	}
	err := schemaCompiler.AddResource(name, strings.NewReader(sch.Schema))
	if err != nil {
		return fmt.Errorf("failed to add resource for %q", name)
	}

	_, err = jsonschema.CompileString(name, sch.Schema)
	if err != nil {
		return fmt.Errorf("failed to validate schema %q: %w", name, err)
	}
	return nil
}

// ValidateProtobufSchema validates a given protobuf schema by trying to parse it as a descriptor
// along with all its references.
func (s *Service) ValidateProtobufSchema(ctx context.Context, name string, sch Schema) error {
	schemasByPath := make(map[string]string)
	schemasByPath[name] = sch.Schema

	for _, ref := range sch.References {
		schemaRefRes, err := s.GetSchemaBySubjectAndVersion(ctx, ref.Subject, strconv.Itoa(ref.Version))
		if err != nil {
			return fmt.Errorf("failed to retrieve reference %q: %w", ref.Subject, err)
		}
		schemasByPath[ref.Name] = schemaRefRes.Schema
	}

	// Add common proto types
	// The well known types are automatically added in the protoreflect protoparse package.
	// But we need to support the other types Redpanda automatically includes.
	// These are added in the embed package, and here we add them to the map for parsing.
	commonProtoMap, err := embed.CommonProtoFileMap()
	if err != nil {
		return fmt.Errorf("failed to load common protobuf types: %w", err)
	}

	for commonPath, commonSchema := range commonProtoMap {
		if _, exists := schemasByPath[commonPath]; !exists {
			schemasByPath[commonPath] = commonSchema
		}
	}

	parser := protoparse.Parser{
		Accessor:              protoparse.FileContentsFromMap(schemasByPath),
		InferImportPaths:      true,
		ValidateUnlinkedFiles: true,
		IncludeSourceCodeInfo: true,
	}

	_, err = parser.ParseFiles(name)

	return err
}

// GetSchemaBySubjectAndVersion retrieves a schema from the schema registry
// by a given <subject, version> tuple.
func (s *Service) GetSchemaBySubjectAndVersion(ctx context.Context, subject string, version string) (*SchemaVersionedResponse, error) {
	cacheKey := subject + "v" + version
	cachedSchema, err, _ := s.schemaBySubjectVersion.Get(cacheKey, func() (*SchemaVersionedResponse, error) {
		schema, err := s.registryClient.GetSchemaBySubject(ctx, subject, version, false)
		if err != nil {
			return nil, fmt.Errorf("get schema by subject failed: %w", err)
		}

		return schema, nil
	})

	return cachedSchema, err
}

// CreateSchema registers a new schema for the given subject.
func (s *Service) CreateSchema(ctx context.Context, subject string, schema Schema) (*CreateSchemaResponse, error) {
	return s.registryClient.CreateSchema(ctx, subject, schema)
}

// GetSchemaUsagesByID returns all usages of a given schema ID. A single schema
// can be reused in multiple subject versions.
func (s *Service) GetSchemaUsagesByID(ctx context.Context, schemaID int) ([]SubjectVersion, error) {
	return s.registryClient.GetSchemaUsagesByID(ctx, schemaID)
}
