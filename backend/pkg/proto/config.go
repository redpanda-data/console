package proto

import (
	"flag"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/git"
)

type Config struct {
	Enabled bool       `json:"enabled"`
	Git     git.Config `json:"git"`

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

	if c.Enabled && !c.Git.Enabled {
		return fmt.Errorf("protobuf deserializer is enabled, but git is disabled. At least one source for protos must be configured")
	}

	if len(c.Mappings) == 0 {
		return fmt.Errorf("protobuf deserializer is enabled, but no topic mappings have been configured")
	}

	return nil
}

func (c *Config) SetDefaults() {
	c.Git.SetDefaults()
}
