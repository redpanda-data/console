// Copyright 2024 Redpanda Data, Inc.
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
	"fmt"

	"github.com/redpanda-data/common-go/net"
	"github.com/redpanda-data/common-go/rpadmin"

	"github.com/redpanda-data/console/backend/pkg/config"
)

// Ensure CachedClientProvider implements ClientFactory interface
var _ ClientFactory = (*SingleClientProvider)(nil)

// SingleClientProvider is a struct that holds a single instance of the Redpanda
// Admin API client. It implements the ClientFactory interface.
type SingleClientProvider struct {
	redpandaCl *rpadmin.AdminAPI
	cfg        config.RedpandaAdminAPI
}

// NewSingleClientProvider creates a new SingleClientProvider with the given configuration and logger.
// It initializes the Redpanda admin API client using the provided configuration.
// Returns an instance of SingleClientProvider or an error if client creation fails.
func NewSingleClientProvider(cfg *config.Config) (*SingleClientProvider, error) {
	redpandaCfg := cfg.Redpanda.AdminAPI

	if !redpandaCfg.Enabled {
		return &SingleClientProvider{}, nil
	}

	// Build admin client with provided credentials
	tlsCfg, err := redpandaCfg.TLS.TLSConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to build TLS config: %w", err)
	}

	// Explicitly set the tlsCfg to nil in case an HTTP target url has been provided
	scheme, _, err := net.ParseHostMaybeScheme(redpandaCfg.URLs[0])
	if err != nil {
		return nil, fmt.Errorf("failed to parse admin api url scheme: %w", err)
	}
	if scheme == "http" {
		tlsCfg = nil
	}

	adminClient, err := rpadmin.NewAdminAPI(redpandaCfg.URLs, redpandaCfg.RPAdminAuth(), tlsCfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create admin client: %w", err)
	}

	return &SingleClientProvider{
		redpandaCl: adminClient,
		cfg:        redpandaCfg,
	}, nil
}

// GetRedpandaAPIClient returns a redpanda admin api for the given context.
func (p *SingleClientProvider) GetRedpandaAPIClient(_ context.Context) (AdminAPIClient, error) {
	if !p.cfg.Enabled {
		return nil, fmt.Errorf("redpanda admin api is not configured")
	}

	return p.redpandaCl, nil
}
