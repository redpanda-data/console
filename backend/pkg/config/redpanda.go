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

type Redpanda struct {
	AdminAPI RedpandaAdminAPI `yaml:"adminApi"`
}

func (c *Redpanda) RegisterFlags(flags *flag.FlagSet) {
	c.AdminAPI.RegisterFlags(flags)
}

func (c *Redpanda) SetDefaults() {
	c.AdminAPI.SetDefaults()
}

func (c *Redpanda) Validate() error {
	err := c.AdminAPI.Validate()
	if err != nil {
		return fmt.Errorf("failed to validate admin api config: %w", err)
	}
	return nil
}
