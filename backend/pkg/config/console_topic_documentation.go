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
)

// ConsoleTopicDocumentation declares the configuration properties that allow you to pull
// topic documentation from a source so that we can render the markdown as HTML inside
// the Console frontend.
type ConsoleTopicDocumentation struct {
	Enabled bool `yaml:"enabled"`
	Git     Git  `yaml:"git"`
}

// RegisterFlags with sensitive configuration options for the Console topic documentation
// feature.
func (c *ConsoleTopicDocumentation) RegisterFlags(f *flag.FlagSet) {
	c.Git.RegisterFlagsWithPrefix(f, "owl.topic-documentation.")
}

// Validate configuration options for the Console topic documentation feature.
func (c *ConsoleTopicDocumentation) Validate() error {
	if !c.Enabled {
		return nil
	}
	if c.Enabled && !c.Git.Enabled {
		return fmt.Errorf("topic documentation is enabled, but git service is diabled. At least one source for topic documentations must be configured")
	}

	return c.Git.Validate()
}

// SetDefaults for ConsoleTopicDocumentation.
func (c *ConsoleTopicDocumentation) SetDefaults() {
	c.Git.SetDefaults()
	c.Git.AllowedFileExtensions = []string{".md"}
}
