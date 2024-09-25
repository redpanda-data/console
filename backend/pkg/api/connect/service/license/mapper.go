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

	"github.com/redpanda-data/console/backend/pkg/license"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
)

type mapper struct{}

func (mapper) adminAPILicenseInformationToProto(in rpadmin.License) *v1alpha1.License {
	year := 24 * time.Hour * 365
	expiresAt := time.Now().Add(10 * year).Unix()
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

func (mapper) consoleLicenseToProto(in license.License) *v1alpha1.License {
	var licenseType v1alpha1.License_Type
	switch in.Type {
	case license.TypeOpenSource:
		licenseType = v1alpha1.License_TYPE_COMMUNITY
	case license.TypeEnterprise:
		licenseType = v1alpha1.License_TYPE_ENTERPRISE
	default:
		licenseType = v1alpha1.License_TYPE_COMMUNITY
	}
	return &v1alpha1.License{
		Source:    v1alpha1.License_SOURCE_REDPANDA_CONSOLE,
		Type:      licenseType,
		ExpiresAt: in.ExpiresAt,
	}
}
