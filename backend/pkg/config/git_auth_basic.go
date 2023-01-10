// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import "flag"

// GitAuthBasicAuth provides the configuration options for authenticating against Git with HTTP basic auth.
type GitAuthBasicAuth struct {
	Enabled  bool   `yaml:"enabled"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

// RegisterFlagsWithPrefix for sensitive Basic Auth configs
func (c *GitAuthBasicAuth) RegisterFlagsWithPrefix(f *flag.FlagSet, prefix string) {
	f.StringVar(&c.Password, prefix+"git.basic-auth.password", "", "Basic Auth password")
}
