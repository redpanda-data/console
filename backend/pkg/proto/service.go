// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package proto

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	//nolint:staticcheck // Switching to the google golang protojson comes with a few breaking changes.
	"github.com/golang/protobuf/jsonpb"
	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/desc/protoparse"
	"github.com/jhump/protoreflect/dynamic"
	"github.com/jhump/protoreflect/dynamic/msgregistry"
	"github.com/twmb/franz-go/pkg/sr"
	"go.uber.org/zap"
	"golang.org/x/sync/singleflight"
	"google.golang.org/protobuf/runtime/protoiface"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/filesystem"
	"github.com/redpanda-data/console/backend/pkg/git"
	"github.com/redpanda-data/console/backend/pkg/schema"
	"github.com/redpanda-data/console/backend/pkg/schema/embed"
)

// RecordPropertyType determines whether the to be recorded payload is either a
// key or value payload from a Kafka record.
type RecordPropertyType int

const (
	// RecordKey indicates a payload that is set in a Record's key.
	RecordKey RecordPropertyType = iota
	// RecordValue indicates a payload that is set in a Record's value.
	RecordValue
)

type RegexProtoTopicMapping struct {
	config.ProtoTopicMapping
	r *regexp.Regexp
}

// Service is in charge of deserializing protobuf encoded payloads. It supports payloads that were
// encoded with involvement of the schema registry as well as plain protobuf-encoded messages.
// This service is also in charge of reading the proto source files from the configured provider.
type Service struct {
	cfg    config.Proto
	logger *zap.Logger

	strictMappingsByTopic map[string]config.ProtoTopicMapping
	regexMappingsByTopic  map[string]RegexProtoTopicMapping
	gitSvc                *git.Service
	fsSvc                 *filesystem.Service
	schemaSvc             *schema.Service

	// fileDescriptorsBySchemaID are used to find the right schema type for messages at deserialization time. The type
	// index is encoded as part of the serialized message.
	fileDescriptorsBySchemaID      map[int]*desc.FileDescriptor
	fileDescriptorsBySchemaIDMutex sync.RWMutex

	registryMutex sync.RWMutex
	registry      *msgregistry.MessageRegistry

	sfGroup singleflight.Group
}

// NewService creates a new proto.Service.
func NewService(cfg config.Proto, logger *zap.Logger, schemaSvc *schema.Service) (*Service, error) {
	var err error

	var gitSvc *git.Service
	if cfg.Git.Enabled {
		gitSvc, err = git.NewService(cfg.Git, logger, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to create new git service: %w", err)
		}
	}

	var fsSvc *filesystem.Service
	if cfg.FileSystem.Enabled {
		fsSvc, err = filesystem.NewService(cfg.FileSystem, logger, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to create new filesystem service: %w", err)
		}
	}

	if cfg.SchemaRegistry.Enabled {
		// Check whether schema service is initialized (requires schema registry configuration)
		if schemaSvc == nil {
			return nil, fmt.Errorf("schema registry is enabled but schema service is nil. Make sure it is configured")
		}

		// Ensure that Protobuf is supported
		supportedTypes, err := schemaSvc.GetSchemaTypes(context.Background())
		if err != nil {
			return nil, fmt.Errorf("failed to get supported schema types from registry. Ensure Protobuf is supported: %w", err)
		}
		isProtobufSupported := false
		for _, t := range supportedTypes {
			if t == "PROTOBUF" {
				isProtobufSupported = true
			}
		}
		if !isProtobufSupported {
			return nil, fmt.Errorf("protobuf is a not supported type in your schema registry")
		}
	}

	strictMappingsByTopic := make(map[string]config.ProtoTopicMapping)
	regexMappingsByTopic := make(map[string]RegexProtoTopicMapping)

	for _, mapping := range cfg.Mappings {
		if mapping.IsRegex {
			r, err := regexp.Compile(mapping.TopicName)
			if err != nil {
				return nil, fmt.Errorf("invalid regexp as a topic name: %w", err)
			}

			regexMappingsByTopic[mapping.TopicName] = RegexProtoTopicMapping{
				ProtoTopicMapping: mapping,
				r:                 r,
			}
			continue
		}
		strictMappingsByTopic[mapping.TopicName] = mapping
	}

	return &Service{
		cfg:    cfg,
		logger: logger,

		strictMappingsByTopic: strictMappingsByTopic,
		regexMappingsByTopic:  regexMappingsByTopic,
		gitSvc:                gitSvc,
		fsSvc:                 fsSvc,
		schemaSvc:             schemaSvc,

		// registry has to be created afterwards
		registry: nil,
	}, nil
}

// Start polling the prototypes from the configured provider (e.g. filesystem or Git) and sync these
// into our in-memory prototype registry.
func (s *Service) Start() error {
	if s.gitSvc != nil {
		err := s.gitSvc.Start()
		if err != nil {
			return fmt.Errorf("failed to start git service: %w", err)
		}
		// Git service periodically pulls the repo. If there are any file changes the proto registry will be rebuilt.
		s.gitSvc.OnFilesUpdatedHook = s.tryCreateProtoRegistry
	}

	if s.fsSvc != nil {
		err := s.fsSvc.Start()
		if err != nil {
			return fmt.Errorf("failed to start filesystem service: %w", err)
		}
		s.fsSvc.OnFilesUpdatedHook = s.tryCreateProtoRegistry
	}

	if s.schemaSvc != nil {
		// Setup a refresh trigger that calls create proto registry function periodically
		go triggerRefresh(s.cfg.SchemaRegistry.RefreshInterval, s.tryCreateProtoRegistry)
	}

	err := s.createProtoRegistry(context.Background())
	if err != nil {
		return fmt.Errorf("failed to create proto registry: %w", err)
	}

	return nil
}

func (s *Service) unmarshalConfluentMessage(payload []byte) ([]byte, int, error) {
	// 1. If schema registry for protobuf is enabled, let's check if this message has been serialized utilizing
	// Confluent's KafakProtobuf serialization format.
	wrapper, err := s.decodeConfluentBinaryWrapper(payload)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to decode confluent wrapper from payload: %w", err)
	}
	schemaID := int(wrapper.SchemaID)

	md, err := s.GetMessageDescriptorForSchema(int(wrapper.SchemaID), wrapper.IndexArray)
	if err != nil {
		return nil, schemaID, err
	}

	jsonBytes, err := s.DeserializeProtobufMessageToJSON(wrapper.ProtoPayload, md)
	if err != nil {
		return nil, schemaID, err
	}

	return jsonBytes, schemaID, nil
}

// DeserializeProtobufMessageToJSON deserializes the protobuf message to JSON.
func (s *Service) DeserializeProtobufMessageToJSON(payload []byte, md *desc.MessageDescriptor) ([]byte, error) {
	msg := dynamic.NewMessage(md)
	err := msg.Unmarshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal payload into protobuf message: %w", err)
	}

	jsonBytes, err := msg.MarshalJSONPB(&jsonpb.Marshaler{
		AnyResolver:  &anyResolver{s.registry},
		EmitDefaults: true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal protobuf message to JSON: %w", err)
	}

	return jsonBytes, nil
}

// SerializeJSONToProtobufMessage serializes the JSON data to Protobuf message.
func (s *Service) SerializeJSONToProtobufMessage(json []byte, md *desc.MessageDescriptor) ([]byte, error) {
	msg := dynamic.NewMessage(md)
	err := msg.UnmarshalJSONPB(&jsonpb.Unmarshaler{
		AnyResolver:        &anyResolver{s.registry},
		AllowUnknownFields: true,
	}, json)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal protobuf message from JSON: %w", err)
	}

	return msg.Marshal()
}

// GetMessageDescriptorForSchema gets the Protobuf message descriptor for the schema ID and message index.
// TODO consolidate this with getMessageDescriptorFromConfluentMessage
func (s *Service) GetMessageDescriptorForSchema(schemaID int, index []int) (*desc.MessageDescriptor, error) {
	fd, exists := s.GetFileDescriptorBySchemaID(schemaID)
	if !exists {
		return nil, fmt.Errorf("schema ID %+v not found", schemaID)
	}

	messageTypes := fd.GetMessageTypes()
	var messageDescriptor *desc.MessageDescriptor
	for _, idx := range index {
		if idx > len(messageTypes) {
			return nil, fmt.Errorf("message index is larger than the message types array length")
		}
		messageDescriptor = messageTypes[idx]
		messageTypes = messageDescriptor.GetNestedMessageTypes()
	}

	if messageDescriptor == nil {
		return nil, fmt.Errorf("protobuf message descriptor for schema id '%+v' and index '%+v' not found", schemaID, index)
	}

	return messageDescriptor, nil
}

// SerializeJSONToConfluentProtobufMessage serialized the JSON message to confluent wrapped payload
// using the schema ID and message index.
func (s *Service) SerializeJSONToConfluentProtobufMessage(json []byte, schemaID int, index []int) ([]byte, error) {
	if len(index) == 0 {
		index = []int{0}
	}

	messageDescriptor, err := s.GetMessageDescriptorForSchema(schemaID, index)
	if err != nil {
		return nil, err
	}

	msg := dynamic.NewMessage(messageDescriptor)
	err = msg.UnmarshalJSONPB(&jsonpb.Unmarshaler{
		AnyResolver:        &anyResolver{s.registry},
		AllowUnknownFields: true,
	}, json)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal protobuf message from JSON: %w", err)
	}

	var srSerde sr.Serde
	srSerde.Register(
		schemaID,
		&dynamic.Message{},
		sr.EncodeFn(func(v any) ([]byte, error) {
			return v.(*dynamic.Message).Marshal()
		}),
		sr.Index(index...),
	)

	return srSerde.Encode(msg)
}

// UnmarshalPayload tries to deserialize a protobuf encoded payload to a JSON message,
// so that it's human-readable in the Console frontend.
func (s *Service) UnmarshalPayload(payload []byte, topicName string, property RecordPropertyType) ([]byte, int, error) {
	// 1. First let's try if we can deserialize this message with schema registry (if configured)
	if s.cfg.SchemaRegistry.Enabled {
		jsonBytes, schemaID, err := s.unmarshalConfluentMessage(payload)
		if err == nil {
			return jsonBytes, schemaID, nil
		}
	}

	// 2. Now let's check if we have static mappings
	messageDescriptor, err := s.GetMessageDescriptor(topicName, property)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get message descriptor for payload: %w", err)
	}

	jsonBytes, err := s.DeserializeProtobufMessageToJSON(payload, messageDescriptor)
	if err != nil {
		return nil, 0, err
	}

	return jsonBytes, 0, nil
}

// IsProtobufSchemaRegistryEnabled returns whether the schema registry is enabled in the configuration.
func (s *Service) IsProtobufSchemaRegistryEnabled() bool {
	return s.cfg.SchemaRegistry.Enabled
}

func (s *Service) getMatchingMapping(topicName string) (mapping config.ProtoTopicMapping, err error) {
	mapping, strictExists := s.strictMappingsByTopic[topicName]
	if strictExists {
		return mapping, nil
	}

	var match bool
	for _, rMapping := range s.regexMappingsByTopic {
		match = rMapping.r.MatchString(topicName)
		if match {
			mapping = rMapping.ProtoTopicMapping
			break
		}
	}

	if !match {
		return mapping, fmt.Errorf("no prototype found for the given topic. Check your configured protobuf mappings")
	}

	return mapping, nil
}

// GetMessageDescriptor tries to find the apr
func (s *Service) GetMessageDescriptor(topicName string, property RecordPropertyType) (*desc.MessageDescriptor, error) {
	// 1. Otherwise check if the user has configured a mapping to a local proto type for this topic and record type
	mapping, err := s.getMatchingMapping(topicName)
	if err != nil {
		return nil, err
	}

	var protoTypeURL string
	if property == RecordKey {
		if mapping.KeyProtoType == "" {
			return nil, fmt.Errorf("no prototype mapping found for the record key of topic '%v'", topicName)
		}
		protoTypeURL = mapping.KeyProtoType
	} else {
		if mapping.ValueProtoType == "" {
			return nil, fmt.Errorf("no prototype mapping found for the record value of topic '%v'", topicName)
		}
		protoTypeURL = mapping.ValueProtoType
	}

	s.registryMutex.RLock()
	defer s.registryMutex.RUnlock()
	messageDescriptor, err := s.registry.FindMessageTypeByUrl(protoTypeURL)
	if err != nil {
		return nil, fmt.Errorf("failed to find the proto type in the proto registry: %w", err)
	}
	if messageDescriptor == nil {
		// If this happens the user should already know that because we check the existence of all mapped types
		// when we create the proto registry. A log message is printed if a mapping can't be find in the registry.
		return nil, fmt.Errorf("failed to find the proto type in the proto registry: message descriptor is nil")
	}

	return messageDescriptor, nil
}

type confluentEnvelope struct {
	SchemaID     uint32
	IndexArray   []int
	ProtoPayload []byte
}

// decodeConfluentBinaryWrapper decodes the serialized message that contains metadata in order for the client to
// know what information it has to fetch from the schema registry to deserialize the Protobuf message.
//
// Binary format:
// Byte 0: A magic byte that identifies this as a message with Confluent Platform framing.
//
// Bytes 1-4: Unique global id of the Protobuf schema that was used for encoding
// (as registered in Confluent Schema Registry), big endian.
//
// Bytes 5-n: A size-prefixed array of indices that identify the specific message type in the schema (a given schema
// can contain many message types and they can be nested). Size and indices are unsigned varints. The common case
// where the message type is the first message in the schema (i.e. index data would be [1,0]) is encoded as
// a single 0 byte as an optimization.
//
// Bytes n+1-end: Protobuf serialized payload.
func (*Service) decodeConfluentBinaryWrapper(payload []byte) (*confluentEnvelope, error) {
	buf := bytes.NewReader(payload)
	magicByte, err := buf.ReadByte()
	if err != nil {
		return nil, fmt.Errorf("failed to read magic byte: %w", err)
	}
	if magicByte != byte(0) {
		return nil, fmt.Errorf("magic byte is not 0")
	}

	var schemaID uint32
	err = binary.Read(buf, binary.BigEndian, &schemaID)
	if err != nil {
		return nil, fmt.Errorf("failed to read schemaID: %w", err)
	}

	arrLength, err := binary.ReadVarint(buf)
	if err != nil {
		return nil, fmt.Errorf("failed to read arrLength: %w", err)
	}

	// Because we can not be sure this is a legit message the read arr length
	// may be too large to make an array. If that's the case we would get a
	// panic with: makeslice: len out of range. Therefore, we check this length
	// before allocating the slice. We assume to not have more than 128 types in
	// a single message
	if arrLength > 128 || arrLength < 0 {
		return nil, fmt.Errorf("arrLength is out of expected bounds, unlikely a legit envelope")
	}

	msgTypeIDs := make([]int, arrLength)
	// If there is just one msgtype (default index - 0) the array won't be sent at all
	if arrLength == 0 {
		msgTypeIDs = append(msgTypeIDs, 0)
	}

	for i := 0; i < int(arrLength); i++ {
		id, err := binary.ReadVarint(buf)
		if err != nil {
			return nil, fmt.Errorf("failed to read msgTypeID: %w", err)
		}
		msgTypeIDs[i] = int(id)
	}

	remainingPayload := make([]byte, buf.Len())
	_, err = buf.Read(remainingPayload)
	if err != nil {
		return nil, fmt.Errorf("failed to read remaining payload: %w", err)
	}

	return &confluentEnvelope{
		SchemaID:     schemaID,
		IndexArray:   msgTypeIDs,
		ProtoPayload: remainingPayload,
	}, nil
}

func (s *Service) tryCreateProtoRegistry() {
	// since this is triggered on proto schema registry refresh interval,
	// as well as when git or file system is updated
	// lets protect against too aggressive refresh interval
	// or multiple concurrent triggers
	s.sfGroup.Do("tryCreateProtoRegistry", func() (any, error) {
		err := s.createProtoRegistry(context.Background())
		if err != nil {
			s.logger.Error("failed to update proto registry", zap.Error(err))
		}

		return nil, nil
	})
}

func (s *Service) createProtoRegistry(ctx context.Context) error {
	startTime := time.Now()

	files := make(map[string]filesystem.File)

	if s.gitSvc != nil {
		for name, file := range s.gitSvc.GetFilesByFilename() {
			files[name] = file
		}
		s.logger.Debug("fetched .proto files from git service cache",
			zap.Int("fetched_proto_files", len(files)))
	}
	if s.fsSvc != nil {
		for name, file := range s.fsSvc.GetFilesByFilename() {
			files[name] = file
		}
		s.logger.Debug("fetched .proto files from filesystem service cache",
			zap.Int("fetched_proto_files", len(files)))
	}

	fileDescriptors, err := s.protoFileToDescriptor(files)
	if err != nil {
		return fmt.Errorf("failed to compile proto files to descriptors: %w", err)
	}

	// Merge proto descriptors from schema registry into the existing proto descriptors
	if s.schemaSvc != nil {
		descriptors, err := s.schemaSvc.GetProtoDescriptors(ctx)
		if err != nil {
			s.logger.Error("failed to get proto descriptors from schema registry", zap.Error(err))
		}
		s.setFileDescriptorsBySchemaID(descriptors)
		s.logger.Info("fetched proto schemas from schema registry", zap.Int("fetched_subjects", len(descriptors)))
	}

	// Create registry and add types from file descriptors
	registry := msgregistry.NewMessageRegistryWithDefaults()
	for _, descriptor := range fileDescriptors {
		registry.AddFile("", descriptor)
	}
	s.logger.Info("registered proto types in Console's local proto registry", zap.Int("registered_types", len(fileDescriptors)))

	s.registryMutex.Lock()
	defer s.registryMutex.Unlock()
	s.registry = registry

	// Let's compare the registry items against the mapping and let the user know if there are missing/mismatched proto types
	foundTypes := 0
	missingTypes := 0
	for _, mapping := range s.cfg.Mappings {
		if mapping.ValueProtoType != "" {
			messageDesc, err := s.registry.FindMessageTypeByUrl(mapping.ValueProtoType)
			if err != nil {
				return fmt.Errorf("failed to get proto type from registry: %w", err)
			}
			if messageDesc == nil {
				s.logger.Warn("protobuf type from configured topic mapping does not exist",
					zap.String("topic_name", mapping.TopicName),
					zap.String("value_proto_type", mapping.ValueProtoType))
				missingTypes++
			} else {
				foundTypes++
			}
		}
		if mapping.KeyProtoType != "" {
			messageDesc, err := s.registry.FindMessageTypeByUrl(mapping.KeyProtoType)
			if err != nil {
				return fmt.Errorf("failed to get proto type from registry: %w", err)
			}
			if messageDesc == nil {
				s.logger.Info("protobuf type from configured topic mapping does not exist",
					zap.String("topic_name", mapping.TopicName),
					zap.String("key_proto_type", mapping.KeyProtoType))
				missingTypes++
			} else {
				foundTypes++
			}
		}
	}

	totalDuration := time.Since(startTime)

	s.logger.Info("checked whether all mapped proto types also exist in the local registry",
		zap.Int("types_found", foundTypes),
		zap.Int("types_missing", missingTypes),
		zap.Int("registered_types", len(fileDescriptors)),
		zap.Duration("operation_duration", totalDuration))

	return nil
}

// protoFileToDescriptorWithBinary parses a .proto file and compiles it to a descriptor using the protoc binary. Protoc must
// be available as command or this will fail.
// Imported dependencies (such as Protobuf timestamp) are included so that the descriptors are self-contained.
func (s *Service) protoFileToDescriptor(files map[string]filesystem.File) ([]*desc.FileDescriptor, error) {
	filesStr := make(map[string]string, len(files))
	filePaths := make([]string, 0, len(filesStr))
	for _, file := range files {
		// Apparently a slash prepends the filepath on some OS (not windows). Hence let's try to remove the prefix if it
		// exists, so that there's no filename mismatch because of that.
		trimmedFilepath := strings.TrimPrefix(file.Path, "/")

		if len(s.cfg.ImportPaths) > 0 {
			for _, prefix := range s.cfg.ImportPaths {
				// Check if file is in one of the import paths. If not, ignore it.
				// If yes, pick up the file,
				// and trim the prefix because an import path is effectively a root.
				if strings.HasPrefix(trimmedFilepath, prefix) {
					trimmedFilepath = strings.TrimPrefix(trimmedFilepath, prefix)
					trimmedFilepath = strings.TrimPrefix(trimmedFilepath, "/")
					filesStr[trimmedFilepath] = string(file.Payload)
					filePaths = append(filePaths, trimmedFilepath)
				}
			}
		} else {
			filesStr[trimmedFilepath] = string(file.Payload)
			filePaths = append(filePaths, trimmedFilepath)
		}
	}

	// Add common proto types
	// The well known types are automatically added in the protoreflect protoparse package.
	// But we need to support the other types Redpanda automatically includes.
	// These are added in the embed package, and here we add them to the map for parsing.
	commonProtoMap, err := embed.CommonProtoFileMap()
	if err != nil {
		return nil, fmt.Errorf("failed to load common protobuf types: %w", err)
	}

	for commonPath, commonSchema := range commonProtoMap {
		if _, exists := filesStr[commonPath]; !exists {
			filesStr[commonPath] = commonSchema
		}
	}

	errorReporter := func(err protoparse.ErrorWithPos) error {
		position := err.GetPosition()
		s.logger.Warn("failed to parse proto file to descriptor",
			zap.String("file", position.Filename),
			zap.Int("line", position.Line),
			zap.Error(err))
		return nil
	}

	parser := protoparse.Parser{
		Accessor:              protoparse.FileContentsFromMap(filesStr),
		ImportPaths:           []string{"."},
		InferImportPaths:      true,
		ValidateUnlinkedFiles: true,
		IncludeSourceCodeInfo: true,
		ErrorReporter:         errorReporter,
	}
	descriptors, err := parser.ParseFiles(filePaths...)
	if err != nil {
		return nil, fmt.Errorf("failed to parse proto files to descriptors: %w", err)
	}

	return descriptors, nil
}

func (s *Service) setFileDescriptorsBySchemaID(descriptors map[int]*desc.FileDescriptor) {
	s.fileDescriptorsBySchemaIDMutex.Lock()
	defer s.fileDescriptorsBySchemaIDMutex.Unlock()

	s.fileDescriptorsBySchemaID = descriptors
}

// GetFileDescriptorBySchemaID gets the file descriptor by schema ID.
func (s *Service) GetFileDescriptorBySchemaID(schemaID int) (*desc.FileDescriptor, bool) {
	s.fileDescriptorsBySchemaIDMutex.Lock()
	defer s.fileDescriptorsBySchemaIDMutex.Unlock()

	desc, exists := s.fileDescriptorsBySchemaID[schemaID]
	return desc, exists
}

// AnyResolver is used to resolve the google.protobuf.Any type.
// It takes a type URL, present in an Any message, and resolves
// it into an instance of the associated message.
//
// This custom resolver is required because the built-in / default
// any resolver in the protoreflect library, does not consider any
// types that are used in referenced types that are not directly
// part of the schema that is deserialized. This is described in
// more detail as part of the pull request that addresses the
// deserialization issue with the any types:
// https://github.com/redpanda-data/console/pull/425
type anyResolver struct {
	mr *msgregistry.MessageRegistry
}

func (r *anyResolver) Resolve(typeURL string) (protoiface.MessageV1, error) {
	// Protoreflect registers the type by stripping the contents before the last
	// slash. Therefore we need to mimic this behaviour in order to resolve
	// the type by it's given type url.
	mname := typeURL
	if slash := strings.LastIndex(mname, "/"); slash >= 0 {
		mname = mname[slash+1:]
	}

	return r.mr.Resolve(mname)
}
