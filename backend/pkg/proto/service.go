package proto

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/filesystem"
	"github.com/cloudhut/kowl/backend/pkg/git"
	"github.com/cloudhut/kowl/backend/pkg/schema"
	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/desc/protoparse"
	"github.com/jhump/protoreflect/dynamic"
	"github.com/jhump/protoreflect/dynamic/msgregistry"
	"go.uber.org/zap"
	"sync"
)

type RecordPropertyType int

const (
	RecordKey RecordPropertyType = iota
	RecordValue
)

type Service struct {
	cfg    Config
	logger *zap.Logger

	mappingsByTopic map[string]ConfigTopicMapping
	gitSvc          *git.Service
	fsSvc           *filesystem.Service
	schemaSvc       *schema.Service

	// fileDescriptorsBySchemaID are used to find the right schema type for messages at deserialization time. The type
	// index is encoded as part of the serialized message.
	fileDescriptorsBySchemaID      map[int]*desc.FileDescriptor
	fileDescriptorsBySchemaIDMutex sync.RWMutex

	registryMutex sync.RWMutex
	registry      *msgregistry.MessageRegistry
}

func NewService(cfg Config, logger *zap.Logger, schemaSvc *schema.Service) (*Service, error) {
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
		supportedTypes, err := schemaSvc.GetSchemaTypes()
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

	mappingsByTopic := make(map[string]ConfigTopicMapping)
	for _, mapping := range cfg.Mappings {
		mappingsByTopic[mapping.TopicName] = mapping
	}

	return &Service{
		cfg:    cfg,
		logger: logger,

		mappingsByTopic: mappingsByTopic,
		gitSvc:          gitSvc,
		fsSvc:           fsSvc,
		schemaSvc:       schemaSvc,

		// registry has to be created afterwards
		registry: nil,
	}, nil
}

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

	err := s.createProtoRegistry()
	if err != nil {
		return fmt.Errorf("failed to create proto registry: %w", err)
	}

	return nil
}

func (s *Service) unmarshalConfluentMessage(payload []byte, topicName string) ([]byte, int, error) {
	// 1. If schema registry for protobuf is enabled, let's check if this message has been serialized utilizing
	// Confluent's KafakProtobuf serialization format.
	wrapper, err := s.decodeConfluentBinaryWrapper(payload)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to decode confluent wrapper from payload: %w", err)
	}
	schemaID := int(wrapper.SchemaID)

	md, cleanPayload, err := s.getMessageDescriptorFromConfluentMessage(wrapper, topicName)
	if err != nil {
		return nil, schemaID, err
	}

	jsonBytes, err := s.deserializeProtobufMessageToJSON(cleanPayload, md)
	if err != nil {
		return nil, schemaID, err
	}

	return jsonBytes, schemaID, nil
}

func (s *Service) deserializeProtobufMessageToJSON(payload []byte, md *desc.MessageDescriptor) ([]byte, error) {
	msg := dynamic.NewMessage(md)
	err := msg.Unmarshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal payload into protobuf message: %w", err)
	}

	jsonBytes, err := msg.MarshalJSON()
	if err != nil {
		return nil, fmt.Errorf("failed to marshal protobuf message to JSON: %w", err)
	}

	return jsonBytes, nil
}

func (s *Service) UnmarshalPayload(payload []byte, topicName string, property RecordPropertyType) ([]byte, int, error) {
	// 1. First let's try if we can deserialize this message with schema registry (if configured)
	if s.cfg.SchemaRegistry.Enabled {
		jsonBytes, schemaID, err := s.unmarshalConfluentMessage(payload, topicName)
		if err == nil {
			return jsonBytes, schemaID, err
		}
	}

	// 2. Now let's check if we have static mappings
	messageDescriptor, err := s.getMessageDescriptor(topicName, property)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get message descriptor for payload: %w", err)
	}

	jsonBytes, err := s.deserializeProtobufMessageToJSON(payload, messageDescriptor)
	if err != nil {
		return nil, 0, err
	}

	return jsonBytes, 0, nil
}

// getMessageDescriptorFromConfluentMessage try to find the right message descriptor of a message that has been serialized
// according to Confluent's ProtobufSerializer. If successful it will return the found message descriptor along with
// the protobuf payload (without the bytes that carry the metadata such as schema id), so that this can be used
// for deserializing the content.
func (s *Service) getMessageDescriptorFromConfluentMessage(wrapper *confluentEnvelope, topicName string) (*desc.MessageDescriptor, []byte, error) {
	fd, exists := s.getFileDescriptorBySchemaID(int(wrapper.SchemaID))
	if !exists {
		return nil, nil, fmt.Errorf("could not find a file descriptor that matches the decoded schema id '%v'", wrapper.SchemaID)
	}

	// Traverse the messagetypes until we found the right message type as navigated to via the message
	// array index. The message array index is an array of ints. Each (nested) type gets indexed level
	// by level. Root level types will be the first number in the array, 2nd level types the second etc.
	messageTypes := fd.GetMessageTypes()
	var msgType *desc.MessageDescriptor
	for _, idx := range wrapper.IndexArray {
		if idx > int64(len(messageTypes)) {
			// This should never happen
			s.logger.Debug("the message index is larger than the message types array length",
				zap.Int64("index", idx),
				zap.Int("array_length", len(messageTypes)),
				zap.String("topic_name", topicName))
			return nil, nil, fmt.Errorf("failed to decode message type: message index is larger than the message types array length")
		}
		msgType = messageTypes[idx]
		messageTypes = msgType.GetNestedMessageTypes()
	}
	return msgType, wrapper.ProtoPayload, nil
}

// getMessageDescriptor tries to find the apr
func (s *Service) getMessageDescriptor(topicName string, property RecordPropertyType) (*desc.MessageDescriptor, error) {
	// 1. Otherwise check if the user has configured a mapping to a local proto type for this topic and record type
	mapping, exists := s.mappingsByTopic[topicName]
	if !exists {
		return nil, fmt.Errorf("no prototype found for the given topic. Check your configured protobuf mappings")
	}

	protoTypeUrl := ""
	if property == RecordKey {
		if mapping.KeyProtoType == "" {
			return nil, fmt.Errorf("no prototype mapping found for the record key of topic '%v'", topicName)
		}
		protoTypeUrl = mapping.KeyProtoType
	} else {
		if mapping.ValueProtoType == "" {
			return nil, fmt.Errorf("no prototype mapping found for the record value of topic '%v'", topicName)
		}
		protoTypeUrl = mapping.ValueProtoType
	}

	s.registryMutex.RLock()
	defer s.registryMutex.RUnlock()
	messageDescriptor, err := s.registry.FindMessageTypeByUrl(protoTypeUrl)
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
	IndexArray   []int64
	ProtoPayload []byte
}

// decodeConfluentBinaryWrapper decodes the serialized message that contains metadata in order for the client to
// know what information it has to fetch from the schema registry to deserialize the Protobuf message.
//
// Binary format:
// Byte 0: A magic byte that identifies this as a message with Confluent Platform framing.
// Bytes 1-4: Unique global id of the Protobuf schema that was used for encoding (as registered in Confluent Schema Registry),
// 		big endian.
// Bytes 5-n: A size-prefixed array of indices that identify the specific message type in the schema (a given schema
//		can contain many message types and they can be nested). Size and indices are unsigned varints. The common case
//		where the message type is the first message in the schema (i.e. index data would be [1,0]) is encoded as
//		a single 0 byte as an optimization.
// Bytes n+1-end: Protobuf serialized payload.
func (s *Service) decodeConfluentBinaryWrapper(payload []byte) (*confluentEnvelope, error) {
	buf := bytes.NewReader(payload)
	magicByte, err := buf.ReadByte()
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

	msgTypeIDs := make([]int64, arrLength)
	// If there is just one msgtype (default index - 0) the array won't be sent at all
	if arrLength == 0 {
		msgTypeIDs = append(msgTypeIDs, 0)
	}

	for i := 0; i < int(arrLength); i++ {
		id, err := binary.ReadVarint(buf)
		if err != nil {
			return nil, fmt.Errorf("failed to read msgTypeID: %w", err)
		}
		msgTypeIDs[i] = id
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
	err := s.createProtoRegistry()
	if err != nil {
		s.logger.Error("failed to update proto registry", zap.Error(err))
	}
}

func (s *Service) createProtoRegistry() error {
	var files map[string]filesystem.File

	if s.gitSvc != nil {
		files = s.gitSvc.GetFilesByFilename()
		s.logger.Debug("fetched .proto files from git service cache",
			zap.Int("fetched_proto_files", len(files)))
	}
	if s.fsSvc != nil {
		files = s.fsSvc.GetFilesByFilename()
		s.logger.Debug("fetched .proto files from filesystem service cache",
			zap.Int("fetched_proto_files", len(files)))
	}

	fileDescriptors, err := s.protoFileToDescriptor(files)
	if err != nil {
		return fmt.Errorf("failed to compile proto files to descriptors: %w", err)
	}

	// Merge proto descriptors from schema registry into the existing proto descriptors
	if s.schemaSvc != nil {
		descriptors, err := s.schemaSvc.GetProtoDescriptors()
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
	s.logger.Info("registered proto types in Kowl's local proto registry", zap.Int("registered_types", len(fileDescriptors)))

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

	s.logger.Info("checked whether all mapped proto types also exist in the local registry",
		zap.Int("types_found", foundTypes),
		zap.Int("types_missing", missingTypes),
		zap.Int("registered_types", len(fileDescriptors)))

	return nil
}

// protoFileToDescriptorWithBinary parses a .proto file and compiles it to a descriptor using the protoc binary. Protoc must
// be available as command or this will fail.
// Imported dependencies (such as Protobuf timestamp) are included so that the descriptors are self-contained.
func (s *Service) protoFileToDescriptor(files map[string]filesystem.File) ([]*desc.FileDescriptor, error) {
	filesStr := make(map[string]string, len(files))
	filePaths := make([]string, 0, len(filesStr))
	for _, file := range files {
		filesStr[file.Path] = string(file.Payload)
		filePaths = append(filePaths, string(file.Path[1:len(file.Path)]))
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
		ImportPaths:	       []string{"/"},
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

func (s *Service) getFileDescriptorBySchemaID(schemaID int) (*desc.FileDescriptor, bool) {
	s.fileDescriptorsBySchemaIDMutex.Lock()
	defer s.fileDescriptorsBySchemaIDMutex.Unlock()

	desc, exists := s.fileDescriptorsBySchemaID[schemaID]
	return desc, exists
}
