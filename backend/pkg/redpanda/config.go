// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package redpanda

import "flag"

type Config struct {
	AdminAPI AdminAPIConfig `yaml:"adminApi"`
}

func (c *Config) RegisterFlags(flags *flag.FlagSet) {
	c.AdminAPI.RegisterFlags(flags)
}

func (c *Config) SetDefaults() {
	c.AdminAPI.SetDefaults()
}

func (c *Config) Validate() error {
	return c.AdminAPI.Validate()
}
