// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package schema provides functionality for managing and interacting with Schema Registry
// clients in a Kafka environment. It defines interfaces and concrete implementations
// for creating and retrieving Schema Registry clients, allowing for flexible configuration
// and efficient reuse of client instances.
package schema

import (
	"context"
	"fmt"

	"github.com/redpanda-data/common-go/rpsr"
	"github.com/twmb/franz-go/pkg/sr"

	"github.com/redpanda-data/console/backend/pkg/config"
)

// ClientFactory defines the interface for creating and retrieving Kafka clients.
type ClientFactory interface {
	// GetSchemaRegistryClient retrieves a schema registry client based on the context.
	GetSchemaRegistryClient(ctx context.Context) (*rpsr.Client, error)
}

// Ensure CachedClientProvider implements ClientFactory interface
var _ ClientFactory = (*SingleClientProvider)(nil)

// SingleClientProvider is a struct that holds a single instance of the Schema
// Registry client. It implements the ClientFactory interface.
type SingleClientProvider struct {
	srClient *rpsr.Client
}

// NewSingleClientProvider creates a new SingleClientProvider with the given configuration and logger.
// It initializes the schema registry client using the provided configuration.
//
// If schema registry is not configured an instance of DisabledClientProvider is returned.
// Otherwise, returns an instance of SingleClientProvider or an error if client creation fails.
func NewSingleClientProvider(cfg *config.Config) (ClientFactory, error) {
	schemaCfg := cfg.SchemaRegistry

	if !schemaCfg.Enabled {
		return &DisabledClientProvider{}, nil
	}

	// If TLS is not enabled this will return the default TLS config.
	tlsCfg, err := schemaCfg.TLS.TLSConfig()
	if err != nil {
		return nil, fmt.Errorf("failed creating tls config: %w", err)
	}

	opts := []sr.ClientOpt{
		sr.URLs(schemaCfg.URLs...),
		sr.UserAgent("redpanda-console"),
		sr.DialTLSConfig(tlsCfg),
	}

	if schemaCfg.Authentication.BasicAuth.Username != "" {
		opts = append(opts, sr.BasicAuth(schemaCfg.Authentication.BasicAuth.Username, schemaCfg.Authentication.BasicAuth.Password))
	}

	if schemaCfg.Authentication.BearerToken != "" {
		opts = append(opts, sr.BearerToken(schemaCfg.Authentication.BearerToken))
	}

	srClient, err := sr.NewClient(opts...)
	if err != nil {
		return nil, err
	}

	client, err := rpsr.NewClient(srClient)
	if err != nil {
		return nil, err
	}

	return &SingleClientProvider{
		srClient: client,
	}, nil
}

// GetSchemaRegistryClient returns a schema registry client for the given context.
func (p *SingleClientProvider) GetSchemaRegistryClient(_ context.Context) (*rpsr.Client, error) {
	return p.srClient, nil
}
