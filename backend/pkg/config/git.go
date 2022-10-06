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
	"flag"
	"fmt"
	"time"
)

// Git config for Git Service
type Git struct {
	Enabled bool `yaml:"enabled"`

	// AllowedFileExtensions specifies file extensions that shall be picked up. If at least one is specified all other
	// file extensions will be ignored.
	AllowedFileExtensions []string `yaml:"-"`

	// Max file size which will be considered. Files exceeding this size will be ignored and logged.
	MaxFileSize int64 `yaml:"-"`

	// Whether or not to use the filename or the full filepath as key in the map
	IndexByFullFilepath bool `yaml:"-"`

	// RefreshInterval specifies how often the repository shall be pulled to check for new changes.
	RefreshInterval time.Duration `yaml:"refreshInterval"`

	// Repository that contains markdown files that document a Kafka topic.
	Repository GitRepository `yaml:"repository"`

	// Authentication Configs
	BasicAuth GitAuthBasicAuth `yaml:"basicAuth"`
	SSH       GitAuthSSH       `yaml:"ssh"`
}

// RegisterFlagsWithPrefix for all (sub)configs
func (c *Git) RegisterFlagsWithPrefix(f *flag.FlagSet, prefix string) {
	c.BasicAuth.RegisterFlagsWithPrefix(f, prefix)
	c.SSH.RegisterFlagsWithPrefix(f, prefix)
}

// Validate all root and child config structs
func (c *Git) Validate() error {
	if !c.Enabled {
		return nil
	}
	if c.RefreshInterval == 0 {
		return fmt.Errorf("git config is enabled but refresh interval is set to 0 (disabled)")
	}

	return c.Repository.Validate()
}

// SetDefaults for all root and child config structs
func (c *Git) SetDefaults() {
	c.Repository.SetDefaults()

	c.RefreshInterval = time.Minute
	c.MaxFileSize = 500 * 1000 // 500KB
	c.IndexByFullFilepath = false
}
