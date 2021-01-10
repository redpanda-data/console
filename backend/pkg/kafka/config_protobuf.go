package kafka

import (
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/git"
	"os/exec"
)

type ProtobufConfig struct {
	Enabled bool       `json:"enabled"`
	Git     git.Config `json:"git"`
}

func (c *ProtobufConfig) Validate() error {
	if !c.Enabled {
		return nil
	}

	if c.Enabled && !c.Git.Enabled {
		return fmt.Errorf("protobuf deserializer is enabled, but git is disabled. At least one source for protos must be configured")
	}

	// Check if protoc command is available
	_, err := exec.LookPath("protoc")
	if err != nil {
		return fmt.Errorf("the protoc library must be installed")
	}

	return nil
}
