// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import "fmt"

type GitRepository struct {
	URL           string `yaml:"url"`
	Branch        string `yaml:"branch"`
	BaseDirectory string `yaml:"baseDirectory"`
}

// Validate given input for config properties
func (c *GitRepository) Validate() error {
	if c.URL == "" {
		return fmt.Errorf("you must set a repository url")
	}

	return nil
}

func (c *GitRepository) SetDefaults() {
	c.BaseDirectory = "."
}
