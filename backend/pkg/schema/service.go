package schema

import (
	"fmt"
	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/desc/protoparse"
	"github.com/linkedin/goavro/v2"
	"go.uber.org/zap"
	"golang.org/x/sync/singleflight"
)

// Service for fetching schemas from a schema registry. It has to provide an interface for other packages which is safe
// for concurrent access and also takes care of caching schemas.
type Service struct {
	cfg          Config
	logger       *zap.Logger
	requestGroup singleflight.Group

	registryClient *Client

	// Schema Cache by schema id
	cacheByID map[uint32]*goavro.Codec
}

// NewService to access schema registry. Returns an error if connection can't be established.
func NewService(cfg Config, logger *zap.Logger) (*Service, error) {
	client, err := newClient(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create schema registry client: %w", err)
	}

	return &Service{
		cfg:            cfg,
		logger:         logger,
		requestGroup:   singleflight.Group{},
		registryClient: client,
		cacheByID:      make(map[uint32]*goavro.Codec),
	}, nil
}

// CheckConnectivity to schema registry. Returns no error if connectivity is fine.
func (s *Service) CheckConnectivity() error {
	return s.registryClient.CheckConnectivity()
}

// GetProtoDescriptors returns all file descriptors in a map where the key is the schema id. This is a rather complex
// function, mostly because we have to do several things so that we can parse the schemas with the protoparser.
func (s *Service) GetProtoDescriptors() (map[int]*desc.FileDescriptor, error) {
	// Singleflight makes sure to not run the function body if there are concurrent requests. We use this to avoid
	// duplicate requests against the schema registry
	key := "get-proto-descriptors"
	v, err, _ := s.requestGroup.Do(key, func() (interface{}, error) {
		schemasRes, err := s.registryClient.GetSchemas()
		if err != nil {
			// If schema registry returns an error we want to retry it next time, so let's forget the key
			s.requestGroup.Forget(key)
			return nil, fmt.Errorf("failed to get schema from registry: %w", err)
		}

		// 1. Index all returned schemas by their respective subject name as stored in the schema registry
		schemasBySubject := make(map[string]SchemaVersionedResponse)
		for _, schema := range schemasRes {
			if schema.Type != "PROTOBUF" {
				continue
			}
			schemasBySubject[schema.Subject] = schema
		}

		// 2. Because the subject name may be different than the import name as used in the proto schemas, we want
		// to index all referenced schemas by their referenced name (e.g. /orders/address.proto instead of subject name)
		referenceNameBySubject := make(map[string]string)
		for _, schema := range schemasRes {
			// If any of the existing schemas is used as reference we want to make sure that we only register it
			// under that path so that it is loaded and parsed only once by the protoparser. We have to register it
			// under the reference name (e.g. "customer.proto") rather than the subject name because only this way
			// the import in proto schemas can be resolved.
			for _, ref := range schema.References {
				sc, exists := schemasBySubject[ref.Subject]
				if !exists {
					return nil, fmt.Errorf("the reference schema with subject '%v' does not exist in the registry", ref.Subject)
				}
				referenceNameBySubject[sc.Subject] = ref.Name
			}
		}

		// 3. We want to construct a map of filename (key) -> proto schema (value) so that we can pass this to the proto
		// parser. Because registering the same proto types twice causes errors, we have to make sure that referenced
		// schemas do only appear once in this schema. Thus, all schemas that are referenced at least once by another
		// schema, will only be registered under their reference name (e.g. "utils/city.proto" and not the subject name)
		schemasByPath := make(map[string]string)
		schemaIDByPath := make(map[string]int)
		for _, schema := range schemasRes {
			if schema.Type != "PROTOBUF" {
				continue
			}

			if val, exists := referenceNameBySubject[schema.Subject]; exists {
				schemasByPath[val] = schema.Schema
				schemaIDByPath[val] = schema.SchemaID
				continue
			}
			schemasByPath[schema.Subject] = schema.Schema
			schemaIDByPath[schema.Subject] = schema.SchemaID
		}

		// 4. Parse files that are currently stored in our in-memory map (rather than files on the file system which
		// would be more common) to file descriptors.
		filePaths := make([]string, 0)
		for path := range schemasByPath {
			filePaths = append(filePaths, path)
		}

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
		descriptors, err := parser.ParseFiles(filePaths...)
		if err != nil {
			return nil, fmt.Errorf("failed to parse proto files to descriptors: %w", err)
		}

		// 5. We want to return a map where the key is the schema id and the value is the file descriptor. This is
		// necessary because this file descriptor may contain several message types. If a type other than the first
		// root level message type is used, the serialized message contains an index that navigates us to the right
		// message type. Thus the file descriptor for each schema id is required in the deserializer.
		response := make(map[int]*desc.FileDescriptor)
		for _, descriptor := range descriptors {
			schemaID, exists := schemaIDByPath[descriptor.GetName()]
			if !exists {
				return nil, fmt.Errorf("failed to map the given path to a schema id")
			}
			response[schemaID] = descriptor
		}

		return response, nil
	})
	if err != nil {
		return nil, err
	}

	descriptors := v.(map[int]*desc.FileDescriptor)

	return descriptors, nil
}

func (s *Service) GetAvroSchemaByID(schemaID uint32) (*goavro.Codec, error) {
	// Singleflight makes sure to not run the function body if there are concurrent requests. We use this to avoid
	// duplicate requests against the schema registry
	key := fmt.Sprintf("get-avro-schema-%d", schemaID)
	v, err, _ := s.requestGroup.Do(key, func() (interface{}, error) {
		if codec, exists := s.cacheByID[schemaID]; exists {
			return codec, nil
		}

		schemaRes, err := s.registryClient.GetSchemaByID(schemaID)
		if err != nil {
			// If schema registry returns an error we want to retry it next time, so let's forget the key
			s.requestGroup.Forget(key)
			return nil, fmt.Errorf("failed to get schema from registry: %w", err)
		}

		codec, err := goavro.NewCodec(schemaRes.Schema)
		if err != nil {
			// If codec compilation returns an error we want to retry it next time (maybe the schema has changed or response
			// was corrupted), so let's forget the key
			s.requestGroup.Forget(key)
			return nil, fmt.Errorf("failed to create codec from schema string: %w", err)
		}

		s.cacheByID[schemaID] = codec

		return codec, nil
	})
	if err != nil {
		return nil, err
	}

	codec := v.(*goavro.Codec)

	return codec, nil
}

func (s *Service) GetSubjects() (*SubjectsResponse, error) {
	return s.registryClient.GetSubjects()
}

func (s *Service) GetSchemaTypes() ([]string, error) {
	return s.registryClient.GetSchemaTypes()
}

func (s *Service) GetSubjectVersions(subject string) (*SubjectVersionsResponse, error) {
	return s.registryClient.GetSubjectVersions(subject)
}

func (s *Service) GetSchemaBySubject(subject string, version string) (*SchemaVersionedResponse, error) {
	return s.registryClient.GetSchemaBySubject(subject, version)
}

func (s *Service) GetMode() (*ModeResponse, error) {
	return s.registryClient.GetMode()
}

func (s *Service) GetConfig() (*ConfigResponse, error) {
	return s.registryClient.GetConfig()
}

func (s *Service) GetSubjectConfig(subject string) (*ConfigResponse, error) {
	return s.registryClient.GetSubjectConfig(subject)
}
