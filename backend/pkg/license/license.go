// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package license provides Redpanda exclusive functionality such as enterprise
// license types.
package license

import (
	"fmt"
	"math"

	adminapi "github.com/redpanda-data/common-go/rpadmin"
)

// License describes the information we receive (and send to the frontend) about a Redpanda
// Enterprise license that is used for Console.
type License struct {
	// Source is where the license is used (e.g. Redpanda Cluster, Console)
	Source Source `json:"source"`
	// Type is the type of license (free, trial, enterprise)
	Type Type `json:"type"`
	// UnixEpochSeconds when the license expires
	ExpiresAt int64 `json:"expiresAt"`
	// Organization is the name of the organization that the license is associated with
	Organization string `json:"organization"`
}

// NewOpenSourceCoreLicense creates a new default open source License.
func NewOpenSourceCoreLicense() License {
	return License{
		Source:       SourceRedpanda,
		Type:         TypeOpenSource,
		ExpiresAt:    math.MaxInt32,
		Organization: "",
	}
}

// AdminAPILicenseToRedpandaLicense maps the license struct returns via the
// Redpanda admin API into a License struct.
func AdminAPILicenseToRedpandaLicense(license adminapi.License) (License, error) {
	if !license.Loaded {
		return NewOpenSourceCoreLicense(), nil
	}

	switch license.Properties.Type {
	case string(TypeFreeTrial), string(TypeEnterprise):
	default:
		return License{}, fmt.Errorf("unknown license type: %s", license.Properties.Type)
	}

	return License{
		Source:    SourceRedpanda,
		Type:      Type(license.Properties.Type),
		ExpiresAt: license.Properties.Expires,
	}, nil
}
