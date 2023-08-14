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
	"time"

	"github.com/hamba/avro/v2"
	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/desc/protoparse"
	"github.com/twmb/go-cache/cache"
	"go.uber.org/zap"
	"golang.org/x/sync/singleflight"

	"github.com/redpanda-data/console/backend/pkg/config"
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
	v, err, _ := s.requestGroup.Do(key, func() (interface{}, error) {
		schemasRes, err := s.registryClient.GetSchemas(ctx, false)
		if err != nil {
			// If schema registry returns an error we want to retry it next time, so let's forget the key
			s.requestGroup.Forget(key)
			return nil, fmt.Errorf("failed to get schema from registry: %w", err)
		}

		// 1. Index all returned schemas by their respective subject name and version as stored in the schema registry
		schemasBySubjectAndVersion := make(map[string]map[int]SchemaVersionedResponse)
		for _, schema := range schemasRes {
			if schema.Type != "PROTOBUF" {
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
			if schema.Type != "PROTOBUF" {
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

	// 2. Parse schema to descriptor file
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

// GetAvroSchemaByID loads the schema by the given schemaID and tries to parse the schema
// contents to an avro.Schema, so that it can be used for decoding Avro encoded messages.
func (s *Service) GetAvroSchemaByID(ctx context.Context, schemaID uint32) (avro.Schema, error) {
	codecCached, err, _ := s.avroSchemaByID.Get(schemaID, func() (avro.Schema, error) {
		schemaRes, err := s.registryClient.GetSchemaByID(ctx, schemaID)
		if err != nil {
			s.logger.Warn("failed to fetch avro schema", zap.Uint32("schema_id", schemaID), zap.Error(err))
			return nil, fmt.Errorf("failed to get schema from registry: %w", err)
		}

		codec, err := s.ParseAvroSchemaWithReferences(ctx, schemaRes)
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

// GetSubjectConfig gets compatibility level for a given subject.
func (s *Service) GetSubjectConfig(ctx context.Context, subject string) (*ConfigResponse, error) {
	return s.registryClient.GetSubjectConfig(ctx, subject)
}

func (s *Service) DeleteSubject(ctx context.Context, subject string, deletePermanently bool) (*DeleteSubjectResponse, error) {
	return s.registryClient.DeleteSubject(ctx, subject, deletePermanently)
}

// ParseAvroSchemaWithReferences parses an avro schema that potentially has references
// to other schemas. References will be resolved by requesting and parsing them
// recursively. If any of the referenced schemas can't be fetched or parsed an
// error will be returned.
func (s *Service) ParseAvroSchemaWithReferences(ctx context.Context, schema *SchemaResponse) (avro.Schema, error) {
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

		if _, err := s.ParseAvroSchemaWithReferences(ctx, &SchemaResponse{
			Schema:     schemaRef.Schema,
			References: schemaRef.References,
		}); err != nil {
			return nil, fmt.Errorf(
				"failed to parse schema reference (subject: %q, version %q): %w",
				reference.Subject, reference.Version, err,
			)
		}
	}

	// Parse the main schema in the end after solving all references
	return avro.Parse(schema.Schema)
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
