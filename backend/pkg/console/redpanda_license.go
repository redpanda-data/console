// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"

	"go.uber.org/zap"

	redpandafactory "github.com/redpanda-data/console/backend/pkg/factory/redpanda"
	"github.com/redpanda-data/console/backend/pkg/license"
)

// getRedpandaLicense retrieves the target cluster's license information.
func (s *Service) getRedpandaLicense(ctx context.Context, redpandaCl redpandafactory.AdminAPIClient) license.License {
	l, err := redpandaCl.GetLicenseInfo(ctx)
	if err != nil {
		// This might be because the target Redpanda cluster has not yet implemented the endpoint
		// to request license information from, hence log at debug level only.
		s.logger.Debug("failed to get license info", zap.Error(err))
		return license.NewOpenSourceCoreLicense()
	}

	decoded, err := license.AdminAPILicenseToRedpandaLicense(l)
	if err != nil {
		s.logger.Warn("failed to decode redpanda cluster license", zap.Error(err))
		return license.NewOpenSourceCoreLicense()
	}

	return decoded
}
