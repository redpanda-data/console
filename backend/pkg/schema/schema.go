// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package schema provides an interface for interacting with a Kafka Schema registry.
// It provides caching and request collapsing and exposes a client for interacting
// with the schema registry via HTTP.
package schema
