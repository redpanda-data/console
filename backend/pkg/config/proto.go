// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"errors"
	"flag"
)

// Proto has all configuration options for decoding proto-serialized Kafka records.
type Proto struct {
	// Enabled enables protobuf deserialization for other sources than schema registry.
	Enabled bool `yaml:"enabled"`

	// The required proto definitions can be provided via Git or Filesystem
	Git        Git        `yaml:"git"`
	FileSystem Filesystem `yaml:"fileSystem"`

	// Mappings define what proto types shall be used for each Kafka topic. If SchemaRegistry is used, no mappings are required.
	Mappings []ProtoTopicMapping `yaml:"mappings"`

	// Proto import paths. By default, the baseDir/root is used. Set import paths
	// if multiple import paths relative to the baseDir shall be used. The
	// behavior is similar to the `-I` flag of protoc.
	ImportPaths []string `yaml:"importPaths"`
}

// RegisterFlags registers all nested config flags.
func (c *Proto) RegisterFlags(f *flag.FlagSet) {
	c.Git.RegisterFlagsWithPrefix(f, "kafka.protobuf.")
}

// Validate the Proto configuration options.
func (c *Proto) Validate() error {
	if !c.Enabled {
		return nil
	}

	if !c.Git.Enabled && !c.FileSystem.Enabled {
		return errors.New("protobuf deserializer is enabled, at least one source provider for proto files must be configured")
	}

	if len(c.Mappings) == 0 {
		return errors.New("protobuf deserializer is enabled, but no topic mappings have been configured")
	}

	return nil
}

// SetDefaults for all proto configuration options.
func (c *Proto) SetDefaults() {
	c.Git.SetDefaults()
	c.FileSystem.SetDefaults()

	// Index by full filepath so that we support .proto files with the same filename in different directories
	c.Git.IndexByFullFilepath = true
	c.Git.AllowedFileExtensions = []string{"proto"}
	c.FileSystem.IndexByFullFilepath = true
	c.FileSystem.AllowedFileExtensions = []string{"proto"}
}
