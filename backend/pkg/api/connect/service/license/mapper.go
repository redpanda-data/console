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
	"time"

	"github.com/redpanda-data/common-go/rpadmin"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

// license types returned by the admin API, currently only "enterprise" and
// "free_trial" are supported
var (
	rpAdminLicenseTypeEnterprise = "enterprise"
)

type mapper struct{}

func (mapper) adminAPILicenseInformationToProto(in rpadmin.License) *v1alpha1.License {
	year := 24 * time.Hour * 365
	expiresAt := time.Now().Add(10 * year).Unix()
	licenseType := v1alpha1.License_TYPE_COMMUNITY

	if in.Loaded {
		if in.Properties.Type == rpAdminLicenseTypeEnterprise {
			licenseType = v1alpha1.License_TYPE_ENTERPRISE
		} else {
			licenseType = v1alpha1.License_TYPE_TRIAL
		}

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
	case redpanda.LicenseTypeFreeTrial:
		licenseType = v1alpha1.License_TYPE_TRIAL
	default:
		licenseType = v1alpha1.License_TYPE_COMMUNITY
	}
	return &v1alpha1.License{
		Source:    v1alpha1.License_SOURCE_REDPANDA_CONSOLE,
		Type:      licenseType,
		ExpiresAt: in.ExpiresAt,
	}
}

func (m mapper) enterpriseFeaturesToProto(in rpadmin.EnterpriseFeaturesResponse) *v1alpha1.ListEnterpriseFeaturesResponse {
	features := make([]*v1alpha1.ListEnterpriseFeaturesResponse_Feature, len(in.Features))
	for i, f := range in.Features {
		features[i] = m.enterpriseFeatureToProto(f)
	}

	return &v1alpha1.ListEnterpriseFeaturesResponse{
		LicenseStatus: m.licenseStatusToProto(in.LicenseStatus),
		Violation:     in.Violation,
		Features:      features,
	}
}

func (mapper) licenseStatusToProto(in rpadmin.LicenseStatus) v1alpha1.ListEnterpriseFeaturesResponse_LicenseStatus {
	switch in {
	case rpadmin.LicenseStatusValid:
		return v1alpha1.ListEnterpriseFeaturesResponse_LICENSE_STATUS_VALID
	case rpadmin.LicenseStatusExpired:
		return v1alpha1.ListEnterpriseFeaturesResponse_LICENSE_STATUS_EXPIRED
	case rpadmin.LicenseStatusNotPresent:
		return v1alpha1.ListEnterpriseFeaturesResponse_LICENSE_STATUS_NOT_PRESENT
	default:
		return v1alpha1.ListEnterpriseFeaturesResponse_LICENSE_STATUS_UNSPECIFIED
	}
}

func (mapper) enterpriseFeatureToProto(in rpadmin.EnterpriseFeature) *v1alpha1.ListEnterpriseFeaturesResponse_Feature {
	return &v1alpha1.ListEnterpriseFeaturesResponse_Feature{
		Name:    in.Name,
		Enabled: in.Enabled,
	}
}
