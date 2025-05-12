// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package redpanda

import (
	"context"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
)

// Ensure CachedClientProvider implements ClientFactory interface
var _ ClientFactory = (*DisabledClientProvider)(nil)

// DisabledClientProvider is the provider ClientFactory implementation if the admin
// api is not configured.
type DisabledClientProvider struct{}

// GetRedpandaAPIClient returns a not configured error when invoked.
func (*DisabledClientProvider) GetRedpandaAPIClient(context.Context, ...ClientOption) (AdminAPIClient, error) {
	return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
}
