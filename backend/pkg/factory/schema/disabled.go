// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package schema

import (
	"context"

	"github.com/redpanda-data/common-go/rpsr"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
)

// Ensure CachedClientProvider implements ClientFactory interface
var _ ClientFactory = (*DisabledClientProvider)(nil)

// DisabledClientProvider is the provider ClientFactory implementation if the schema registry
// api is not configured.
type DisabledClientProvider struct{}

// GetSchemaRegistryClient returns a standard error for an unconfigured schema registry when invoked.
func (*DisabledClientProvider) GetSchemaRegistryClient(context.Context) (*rpsr.Client, error) {
	return nil, apierrors.NewSchemaRegistryNotConfiguredError()
}
