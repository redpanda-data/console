// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package license

import (
	"math"

	"github.com/redpanda-data/common-go/rpadmin"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

type mapper struct{}

func (mapper) adminApiLicenseInformationToProto(in rpadmin.License) *v1alpha1.License {
	expiresAt := int64(math.MaxInt64)
	licenseType := v1alpha1.License_TYPE_COMMUNITY

	if in.Loaded {
		licenseType = v1alpha1.License_TYPE_ENTERPRISE
		expiresAt = in.Properties.Expires
	}

	return &v1alpha1.License{
		Source:    v1alpha1.License_SOURCE_REDPANDA_CORE,
		Type:      licenseType,
		ExpiresAt: expiresAt,
	}
}

func (mapper) consoleLicenseToProto(in redpanda.License) *v1alpha1.License {
	var licenseType v1alpha1.License_Type
	switch in.Type {
	case redpanda.LicenseTypeOpenSource:
		licenseType = v1alpha1.License_TYPE_COMMUNITY
	case redpanda.LicenseTypeEnterprise:
		licenseType = v1alpha1.License_TYPE_ENTERPRISE
	default:
		licenseType = v1alpha1.License_TYPE_COMMUNITY
	}
	return &v1alpha1.License{
		Source:    v1alpha1.License_SOURCE_REDPANDA_CONSOLE,
		Type:      licenseType,
		ExpiresAt: int64(math.MaxInt64),
	}
}
