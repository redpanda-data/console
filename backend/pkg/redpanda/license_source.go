// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package redpanda

// LicenseSource describes whether this license information belongs to Redpanda Console
// or the Redpanda cluster we are connected to. Each of these components load their own
// license so that they are independent in terms of availability.
type LicenseSource string

const (
	// LicenseSourceConsole represents a license set in Redpanda Console.
	LicenseSourceConsole LicenseSource = "console"

	// LicenseSourceRedpanda represents a license set in a Redpanda cluster.
	LicenseSourceRedpanda LicenseSource = "cluster"
)
