// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package redpanda

import "math"

type License struct {
	// Source is where the license is used (e.g. Redpanda Cluster, Console)
	Source LicenseSource `json:"source"`
	// Type is the type of license (free, trial, enterprise)
	Type LicenseType `json:"type"`
	// UnixEpochSeconds when the license expires
	ExpiresAt int64 `json:"expiresAt"`
}

func newOpenSourceLicense() License {
	return License{
		Source:    LicenseSourceConsole,
		Type:      LicenseTypeOpenSource,
		ExpiresAt: math.MaxInt32,
	}
}
