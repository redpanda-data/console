// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package rpconnect provides functionality used in endpoints for Redpanda Connect.
package rpconnect

import (
	_ "embed"
)

// This schema is generated with the command:
// benthos list --format json-full-scrubbed > ./data/schema.json
//
//go:embed data/schema.json
var schemaBytes []byte

// GetConfigSchema returns the static config schema for Redpanda Connect.
func GetConfigSchema() []byte {
	return schemaBytes
}
