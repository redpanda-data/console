package proto

import (
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/git"
	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/desc/protoparse"
	"github.com/jhump/protoreflect/dynamic/msgregistry"
	"go.uber.org/zap"
)

type Service struct {
	cfg      Config
	logger   *zap.Logger
	registry *msgregistry.MessageRegistry

	gitSvc *git.Service
}

func NewService(cfg Config, logger *zap.Logger) (*Service, error) {
	gitSvc, err := git.NewService(cfg.Git, logger)
	if err != nil {
		return nil, fmt.Errorf("failed to create new git service: %w", err)
	}

	return &Service{
		cfg:    cfg,
		logger: logger,
		gitSvc: gitSvc,
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

	// TODO: SEtup background task to periodically update registry

	return nil
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
	s.registry = registry

	// Let's compare the registry items against the mapping and let the user know if there are missing/mismatched proto types
	for _, mapping := range s.cfg.Mappings {
		desc, err := s.registry.FindMessageTypeByUrl(mapping.ProtoType)
		if err != nil {
			return fmt.Errorf("failed to get proto type from registry: %w", err)
		}
		if desc == nil {
			s.logger.Info("protobuf type from configured topic mapping does not exist",
				zap.String("topic_name", mapping.TopicName),
				zap.String("proto_type", mapping.ProtoType))
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
