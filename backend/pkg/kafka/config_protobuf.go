package kafka

import (
	"fmt"
	"os/exec"
)

type ProtobufConfig struct {
	Enabled bool `json:"enabled"`
}

func (c *ProtobufConfig) Validate() error {
	if !c.Enabled {
		return nil
	}

	// Check if protoc command is available
	_, err := exec.LookPath("protoc")
	if err != nil {
		return fmt.Errorf("the protoc library must be installed")
	}

	return nil
}
