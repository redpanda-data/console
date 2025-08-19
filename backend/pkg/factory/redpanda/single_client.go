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
	"log/slog"

	"github.com/redpanda-data/common-go/net"
	"github.com/redpanda-data/common-go/rpadmin"

	"github.com/redpanda-data/console/backend/pkg/config"
)

// Ensure CachedClientProvider implements ClientFactory interface
var _ ClientFactory = (*SingleClientProvider)(nil)

// SingleClientProvider is a struct that holds a single instance of the Redpanda
// Admin API client. It implements the ClientFactory interface.
type SingleClientProvider struct {
	cfg    config.RedpandaAdminAPI
	logger *slog.Logger
}

// NewSingleClientProvider creates a new SingleClientProvider with the given configuration and logger.
// It initializes the Redpanda admin API client using the provided configuration.
//
// If schema registry is not configured an instance of DisabledClientProvider is returned.
// Otherwise, returns an instance of SingleClientProvider or an error if client creation fails.
func NewSingleClientProvider(cfg *config.Config, l *slog.Logger) (ClientFactory, error) {
	redpandaCfg := cfg.Redpanda.AdminAPI

	if !redpandaCfg.Enabled {
		return &DisabledClientProvider{}, nil
	}

	return &SingleClientProvider{
		cfg:    redpandaCfg,
		logger: l,
	}, nil
}

// GetRedpandaAPIClient returns a redpanda admin api for the given context.
func (p *SingleClientProvider) GetRedpandaAPIClient(ctx context.Context, opts ...ClientOption) (AdminAPIClient, error) {
	cfg := &ClientOptions{
		URLs: p.cfg.URLs,
	}

	for _, opt := range opts {
		if err := opt(cfg); err != nil {
			return nil, fmt.Errorf("applying option: %w", err)
		}
	}

	// Explicitly set the tlsCfg to nil in case an HTTP target url has been provided
	scheme, host, err := net.ParseHostMaybeScheme(cfg.URLs[0])
	if err != nil {
		return nil, fmt.Errorf("failed to parse admin api url scheme: %w", err)
	}

	hostname, _ := net.SplitHostPortDefault(host, 443)

	// Build admin client with provided credentials with reloader
	tlsCfg, err := p.cfg.TLS.TLSConfigWithReloader(
		ctx,
		p.logger,
		hostname,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to build TLS config: %w", err)
	}

	if scheme == "http" {
		tlsCfg = nil
	}

	adminClient, err := rpadmin.NewAdminAPI(cfg.URLs, p.cfg.RPAdminAuth(), tlsCfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create admin client: %w", err)
	}

	return adminClient, nil
}
