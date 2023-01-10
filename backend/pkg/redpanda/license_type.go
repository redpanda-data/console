// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package redpanda

// LicenseType is a string enum that determines the type of the used license.
type LicenseType string

const (
	// LicenseTypeFreeTrial represents a free trial license.
	LicenseTypeFreeTrial LicenseType = "free_trial"

	// LicenseTypeEnterprise represents the Redpanda Enterprise license.
	LicenseTypeEnterprise LicenseType = "enterprise"

	// LicenseTypeOpenSource represents the default - the open source license.
	LicenseTypeOpenSource LicenseType = "open_source"
)
