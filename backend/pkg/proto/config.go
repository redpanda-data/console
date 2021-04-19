package proto

import (
	"flag"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/filesystem"
	"github.com/cloudhut/kowl/backend/pkg/git"
)

type Config struct {
	Enabled    bool              `json:"enabled"`
	Git        git.Config        `json:"git"`
	FileSystem filesystem.Config `json:"fileSystem"`

	// Mappings define what proto types shall be used for each Kafka topic.
	Mappings []ConfigTopicMapping `json:"mappings"`
}

// RegisterFlags registers all nested config flags.
func (c *Config) RegisterFlags(f *flag.FlagSet) {
	c.Git.RegisterFlagsWithPrefix(f, "kafka.protobuf.")
}

func (c *Config) Validate() error {
	if !c.Enabled {
		return nil
	}

	if !c.Git.Enabled && !c.FileSystem.Enabled {
		return fmt.Errorf("protobuf deserializer is enabled, at least one source provider for proto files must be configured")
	}

	if len(c.Mappings) == 0 {
		return fmt.Errorf("protobuf deserializer is enabled, but no topic mappings have been configured")
	}

	return nil
}

func (c *Config) SetDefaults() {
	c.Git.SetDefaults()
	c.FileSystem.SetDefaults()

	// Index by full filepath so that we support .proto files with the same filename in different directories
	c.Git.IndexByFullFilepath = true
	c.Git.AllowedFileExtensions = []string{"proto"}
	c.FileSystem.IndexByFullFilepath = true
	c.FileSystem.AllowedFileExtensions = []string{"proto"}
}
