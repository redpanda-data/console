// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

// PComp represents the producer compression type default.
type PComp struct {
	Value string `yaml:"value"`
}

// SetDefaults for the producer compression type configuration.
func (c *PComp) SetDefaults() {
	c.Value = "snappy"
}
