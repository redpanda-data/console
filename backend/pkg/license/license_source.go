// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package license

// Source describes whether this license information belongs to Redpanda Console
// or the Redpanda cluster we are connected to. Each of these components load their own
// license so that they are independent in terms of availability.
type Source string

const (
	// SourceConsole represents a license set in Redpanda Console.
	SourceConsole Source = "console"

	// SourceRedpanda represents a license set in a Redpanda cluster.
	SourceRedpanda Source = "cluster"
)
