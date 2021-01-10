package proto

import (
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/git"
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

	registryMutex sync.RWMutex
	registry      *msgregistry.MessageRegistry
}

func NewService(cfg Config, logger *zap.Logger) (*Service, error) {
	// Index by full filepath so that we support .proto files with the same filename in different directories
	cfg.Git.IndexByFullFilepath = true
	gitSvc, err := git.NewService(cfg.Git, logger, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create new git service: %w", err)
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

		// registry has to be created afterwards
		registry: nil,
	}, nil
}

func (s *Service) Start() error {
	err := s.gitSvc.Start()
	if err != nil {
		return fmt.Errorf("failed to start git service: %w", err)
	}

	err = s.createProtoRegistry()
	if err != nil {
		return fmt.Errorf("failed to start git service: %w", err)
	}

	// Git service periodically pulls the repo. If there are any file changes the proto registry will be rebuilt.
	s.gitSvc.OnFilesUpdatedHook = s.tryCreateProtoRegistry

	return nil
}

func (s *Service) UnmarshalPayload(payload []byte, topicName string, property RecordPropertyType) ([]byte, error) {
	messageDescriptor, err := s.getMessageDescriptor(topicName, property)
	if err != nil {
		return nil, fmt.Errorf("failed to get message descriptor for payload: %w", err)
	}

	msg := dynamic.NewMessage(messageDescriptor)
	err = msg.Unmarshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal payload into protobuf message: %w", err)
	}

	jsonBytes, err := msg.MarshalJSON()
	if err != nil {
		return nil, fmt.Errorf("failed to marshal protobuf message to JSON: %w", err)
	}

	return jsonBytes, nil
}

func (s *Service) getMessageDescriptor(topicName string, property RecordPropertyType) (*desc.MessageDescriptor, error) {
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

func (s *Service) tryCreateProtoRegistry() {
	err := s.createProtoRegistry()
	if err != nil {
		s.logger.Error("failed to update proto registry", zap.Error(err))
	}
}

func (s *Service) createProtoRegistry() error {
	files := s.gitSvc.GetFilesByFilename()
	s.logger.Debug("fetched .proto files from git service cache",
		zap.Int("fetched_proto_files", len(files)))

	fileDescriptors, err := s.protoFileToDescriptor(files)
	if err != nil {
		return fmt.Errorf("failed to compile proto files to descriptors: %w", err)
	}

	// Create registry and add types from file descriptors
	registry := msgregistry.NewMessageRegistryWithDefaults()
	for _, descriptor := range fileDescriptors {
		registry.AddFile("", descriptor)
	}

	s.registryMutex.Lock()
	defer s.registryMutex.Unlock()
	s.registry = registry

	// Let's compare the registry items against the mapping and let the user know if there are missing/mismatched proto types
	for _, mapping := range s.cfg.Mappings {
		if mapping.ValueProtoType != "" {
			desc, err := s.registry.FindMessageTypeByUrl(mapping.ValueProtoType)
			if err != nil {
				return fmt.Errorf("failed to get proto type from registry: %w", err)
			}
			if desc == nil {
				s.logger.Info("protobuf type from configured topic mapping does not exist",
					zap.String("topic_name", mapping.TopicName),
					zap.String("value_proto_type", mapping.ValueProtoType))
			}
		}
		if mapping.KeyProtoType != "" {
			desc, err := s.registry.FindMessageTypeByUrl(mapping.KeyProtoType)
			if err != nil {
				return fmt.Errorf("failed to get proto type from registry: %w", err)
			}
			if desc == nil {
				s.logger.Info("protobuf type from configured topic mapping does not exist",
					zap.String("topic_name", mapping.TopicName),
					zap.String("key_proto_type", mapping.KeyProtoType))
			}
		}
	}

	return nil
}

// protoFileToDescriptorWithBinary parses a .proto file and compiles it to a descriptor using the protoc binary. Protoc must
// be available as command or this will fail.
// Imported dependencies (such as Protobuf timestamp) are included so that the descriptors are self-contained.
//
// ProtoPath is the path that contains all .proto files. This directory will be searched for imports.
// Filename is the .proto file within the protoPath that shall be parsed.
func (s *Service) protoFileToDescriptor(files map[string]git.File) ([]*desc.FileDescriptor, error) {
	filesStr := make(map[string]string, len(files))
	fileNames := make([]string, 0, len(filesStr))
	for _, file := range files {
		filesStr[file.Filename] = string(file.Payload)
		fileNames = append(fileNames, file.Filename)
	}

	parser := protoparse.Parser{
		Accessor:              protoparse.FileContentsFromMap(filesStr),
		ValidateUnlinkedFiles: true,
		IncludeSourceCodeInfo: true,
	}
	descriptors, err := parser.ParseFiles(fileNames...)
	if err != nil {
		return nil, fmt.Errorf("failed to parse proto files to descriptors: %w", err)
	}

	return descriptors, nil
}

// protoFileToDescriptorWithBinary parses a .proto file and compiles it to a descriptor using the protoc binary. Protoc must
// be available as command or this will fail.
// Imported dependencies (such as Protobuf timestamp) are included so that the descriptors are self-contained.
//
// ProtoPath is the path that contains all .proto files. This directory will be searched for imports.
// Filename is the .proto file within the protoPath that shall be parsed.
/*
func (s *Service) protoFileToDescriptorWithBinary(protoPath string, filename string) (*descriptorpb.FileDescriptorSet, error) {
	tmpFile := filename + "-tmp.pb"
	targetFilepath := path.Join(s.cfg.TempDirectoryPath, filename)
	cmd := exec.Command("./protoc/protoc",
		"--include_imports",
		"--descriptor_set_out="+tmpFile,
		"--proto_path="+protoPath,
		targetFilepath)

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	err := cmd.Run()
	if err != nil {
		return nil, fmt.Errorf("failed to compile descriptor set using protoc: %w", err)
	}
	defer os.Remove(targetFilepath)

	marshalledDescriptorSet, err := ioutil.ReadFile(tmpFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read descriptor set from file: %w", err)
	}
	descriptorSet := descriptorpb.FileDescriptorSet{}
	err = proto.Unmarshal(marshalledDescriptorSet, &descriptorSet)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal descriptor set: %w", err)
	}

	return &descriptorSet, nil
}
*/
