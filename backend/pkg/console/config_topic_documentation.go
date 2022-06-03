// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"flag"
	"fmt"

	"github.com/cloudhut/kowl/backend/pkg/git"
)

type ConfigTopicDocumentation struct {
	Enabled bool       `yaml:"enabled"`
	Git     git.Config `yaml:"git"`
}

func (c *ConfigTopicDocumentation) RegisterFlags(f *flag.FlagSet) {
	c.Git.RegisterFlagsWithPrefix(f, "owl.topic-documentation.")
}

func (c *ConfigTopicDocumentation) Validate() error {
	if !c.Enabled {
		return nil
	}
	if c.Enabled && !c.Git.Enabled {
		return fmt.Errorf("topic documentation is enabled, but git service is diabled. At least one source for topic documentations must be configured")
	}

	return c.Git.Validate()
}

func (c *ConfigTopicDocumentation) SetDefaults() {
	c.Git.SetDefaults()
	c.Git.AllowedFileExtensions = []string{".md"}
}
