// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"io/fs"

	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/factory/kafka"
	redpandafactory "github.com/redpanda-data/console/backend/pkg/factory/redpanda"
	"github.com/redpanda-data/console/backend/pkg/factory/schema"
	"github.com/redpanda-data/console/backend/pkg/license"
)

type options struct {
	frontendResources      fs.FS
	license                license.License
	kafkaClientProvider    kafka.ClientFactory
	redpandaClientProvider redpandafactory.ClientFactory
	schemaClientProvider   schema.ClientFactory
	logger                 *zap.Logger
}

// Option is a function that applies some configuration to the options struct.
type Option func(*options)

// apply takes an options instance and applies the configuration.
func (opt Option) apply(opts *options) {
	opt(opts)
}

// WithFrontendResources is an option to set an in-memory filesystem that provides the frontend resources.
// The index.html is expected to be at the root of the filesystem. This method is called by Console
// Enterprise, so that it can inject additional assets to the frontend.
func WithFrontendResources(fsys fs.FS) Option {
	return func(o *options) {
		o.frontendResources = fsys
	}
}

// WithLicense provides the license information which was used to start Redpanda
// Console. It is used only for visibility & logging purposes and not for any
// license enforcing actions.
func WithLicense(license license.License) Option {
	return func(o *options) {
		o.license = license
	}
}

// WithKafkaClientFactory uses the provided ClientFactory for creating new Kafka
// clients in all endpoint handlers.
func WithKafkaClientFactory(factory kafka.ClientFactory) Option {
	return func(o *options) {
		o.kafkaClientProvider = factory
	}
}

// WithRedpandaClientFactory uses the provided ClientFactory for creating new
// Redpanda API clients in all endpoint handlers.
func WithRedpandaClientFactory(factory redpandafactory.ClientFactory) Option {
	return func(o *options) {
		o.redpandaClientProvider = factory
	}
}

// WithSchemaClientFactory uses the provided ClientFactory for creating new
// Schema Registry clients in all endpoint handlers.
func WithSchemaClientFactory(factory schema.ClientFactory) Option {
	return func(o *options) {
		o.schemaClientProvider = factory
	}
}

// WithLogger allows to plug in your own pre-configured zap.Logger. If provided
// we will not try to set up our own logger.
func WithLogger(logger *zap.Logger) Option {
	return func(o *options) {
		o.logger = logger
	}
}
