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
	"flag"
	"fmt"

	"github.com/redpanda-data/console/backend/pkg/filesystem"
	"github.com/redpanda-data/console/backend/pkg/git"
)

type Config struct {
	Enabled bool `json:"enabled"`

	// The required proto definitions can be provided via SchemaRegistry, Git or Filesystem
	SchemaRegistry SchemaRegistryConfig `json:"schemaRegistry"`
	Git            git.Config           `json:"git"`
	FileSystem     filesystem.Config    `json:"fileSystem"`

	// Mappings define what proto types shall be used for each Kafka topic. If SchemaRegistry is used, no mappings are required.
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

	if !c.Git.Enabled && !c.FileSystem.Enabled && !c.SchemaRegistry.Enabled {
		return fmt.Errorf("protobuf deserializer is enabled, at least one source provider for proto files must be configured")
	}

	if len(c.Mappings) == 0 && !c.SchemaRegistry.Enabled {
		return fmt.Errorf("protobuf deserializer is enabled, but no topic mappings have been configured")
	}

	return nil
}

func (c *Config) SetDefaults() {
	c.Git.SetDefaults()
	c.FileSystem.SetDefaults()
	c.SchemaRegistry.SetDefaults()

	// Index by full filepath so that we support .proto files with the same filename in different directories
	c.Git.IndexByFullFilepath = true
	c.Git.AllowedFileExtensions = []string{"proto"}
	c.FileSystem.IndexByFullFilepath = true
	c.FileSystem.AllowedFileExtensions = []string{"proto"}
}
