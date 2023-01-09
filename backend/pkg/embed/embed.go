// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package embed provides all static resources that shall be served from the compiled
// binary. This is mainly used to provide the compiled React frontend, so that we
// can have a single binary that serves Redpanda Console, rather than a Go backend
// and some frontend assets that must be loaded by the Go binary.
package embed
