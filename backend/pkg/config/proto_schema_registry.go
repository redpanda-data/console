// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import "time"

// ProtoSchemaRegistry that shall be used to get Protobuf types and Mappings from. The schema registry configuration
// is not part of this config as the schema registry client that is configured under kafka.schemaRegistry will be
// reused here. It is it's own configuration struct to remain extensible in the future without requiring breaking changes.
type ProtoSchemaRegistry struct {
	Enabled         bool          `json:"enabled"`
	RefreshInterval time.Duration `json:"refreshInterval"`
}

// SetDefaults for the Proto schema registry configuration.
func (s *ProtoSchemaRegistry) SetDefaults() {
	s.RefreshInterval = 5 * time.Minute
}
