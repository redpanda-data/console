// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import "errors"

// GitRepository is the configuration options that determine what Git repository, branch and
// directory shall be used.
type GitRepository struct {
	URL           string `yaml:"url"`
	Branch        string `yaml:"branch"`
	BaseDirectory string `yaml:"baseDirectory"`
	MaxDepth      int    `yaml:"maxDepth"`
}

// Validate given input for config properties
func (c *GitRepository) Validate() error {
	if c.URL == "" {
		return errors.New("you must set a repository url")
	}

	return nil
}

// SetDefaults for Git repository configurations.
func (c *GitRepository) SetDefaults() {
	c.BaseDirectory = "."
	c.MaxDepth = 15
}
