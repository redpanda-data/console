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

// Redpanda is the config object for all Redpanda specific options.
type Redpanda struct {
	AdminAPI RedpandaAdminAPI `yaml:"adminApi"`
}

// RegisterFlags for all sensitive, Redpanda specific configurations.
func (c *Redpanda) RegisterFlags(flags *flag.FlagSet) {
	c.AdminAPI.RegisterFlags(flags)
}

// SetDefaults for all Redpanda specific configurations.
func (c *Redpanda) SetDefaults() {
	c.AdminAPI.SetDefaults()
}

// Validate all Redpanda specific configurations.
func (c *Redpanda) Validate() error {
	err := c.AdminAPI.Validate()
	if err != nil {
		return fmt.Errorf("failed to validate admin api config: %w", err)
	}
	return nil
}
