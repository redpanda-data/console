package proto

import (
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/git"
	"github.com/jhump/protoreflect/desc/protoparse"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"
	"io/ioutil"
	"os"
	"os/exec"
	"path"
)

type Service struct {
	cfg      Config
	logger   *zap.Logger
	registry *protoregistry.Files

	gitSvc *git.Service
}

func NewService(cfg Config, logger *zap.Logger, gitSvc *git.Service) (*Service, error) {
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

	return nil
}

func createProtoRegistry() *protoregistry.Files {
	return nil
}

// protoFileToDescriptorWithBinary parses a .proto file and compiles it to a descriptor using the protoc binary. Protoc must
// be available as command or this will fail.
// Imported dependencies (such as Protobuf timestamp) are included so that the descriptors are self-contained.
//
// ProtoPath is the path that contains all .proto files. This directory will be searched for imports.
// Filename is the .proto file within the protoPath that shall be parsed.
func (s *Service) protoFileToDescriptor(protoPath string, filename string) (*descriptorpb.FileDescriptorSet, error) {
	var files map[string]string
	accessor := protoparse.FileContentsFromMap(files)
	parser := protoparse.Parser{
		Accessor:              accessor,
		ValidateUnlinkedFiles: true,
		IncludeSourceCodeInfo: true,
	}
	descriptors, err := parser.ParseFiles()
	if err != nil {
		return nil, fmt.Errorf("failed to parse proto files to descriptors: %w", err)
	}
}

// protoFileToDescriptorWithBinary parses a .proto file and compiles it to a descriptor using the protoc binary. Protoc must
// be available as command or this will fail.
// Imported dependencies (such as Protobuf timestamp) are included so that the descriptors are self-contained.
//
// ProtoPath is the path that contains all .proto files. This directory will be searched for imports.
// Filename is the .proto file within the protoPath that shall be parsed.
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
