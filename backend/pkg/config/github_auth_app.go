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

// GitGithubApp is the configuration to authenticate against Git via GitHub App.
type GitGithubApp struct {
	Enabled            bool   `yaml:"enabled"`
	AppID              int64  `yaml:"appId"`
	InstallationID     int64  `yaml:"installationId"`
	PrivateKey         string `yaml:"privateKey"`
	PrivateKeyFilePath string `yaml:"privateKeyFilepath"`
}

// RegisterFlagsWithPrefix for sensitive GitHub App configs
func (c *GitGithubApp) RegisterFlagsWithPrefix(f *flag.FlagSet, prefix string) {
	f.StringVar(&c.PrivateKey, prefix+"git.github-app.private-key", "", "Private key for GitHub App authentication")
}

// Validate the GitHub App authentication configuration.
func (c *GitGithubApp) Validate() error {
	if !c.Enabled {
		return nil
	}

	if c.AppID <= 0 {
		return errors.New("github app authentication is enabled but appId is not set or invalid")
	}

	if c.InstallationID <= 0 {
		return errors.New("github app authentication is enabled but installationId is not set or invalid")
	}

	if c.PrivateKey == "" && c.PrivateKeyFilePath == "" {
		return errors.New("github app authentication is enabled but neither privateKey nor privateKeyFilepath is set")
	}

	return nil
}
