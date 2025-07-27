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
	"context"
	"io/fs"
	"log/slog"

	"github.com/prometheus/client_golang/prometheus"

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
	logger                 *slog.Logger
	cacheNamespaceFn       func(context.Context) (string, error)
	prometheusRegistry     prometheus.Registerer
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

// WithLogger sets a custom logger instance to use instead of creating one from config.
// This allows enterprise to provide a fully configured logger with custom handlers,
// formatters, and other enterprise-specific logging features.
func WithLogger(logger *slog.Logger) Option {
	return func(o *options) {
		o.logger = logger
	}
}

// WithCacheNamespaceFn is an option to set a function that determines the
// namespace for caching compiled resources such as schemas. This is specifically
// used for resource caching (compiled Avro/Protobuf/JSON schemas) and should be
// set in multi-tenant environments where tenants should be strictly isolated
// from each other.
//
// The function must return a unique identifier for the current tenant that can
// be used as a namespace for resource caching. Examples include virtual cluster IDs,
// tenant IDs, or organization IDs. Only within that namespace resources will be cached
// and looked-up.
//
// Note: This function is NOT used for client caching (Kafka, Schema Registry, Admin API clients).
// It only affects the caching of compiled/processed resources.
func WithCacheNamespaceFn(fn func(context.Context) (string, error)) Option {
	return func(o *options) {
		o.cacheNamespaceFn = fn
	}
}

// WithPrometheusRegistry sets the Prometheus registry to use for registering metrics.
// This registry is used exclusively for registering application metrics.
func WithPrometheusRegistry(registry prometheus.Registerer) Option {
	return func(o *options) {
		o.prometheusRegistry = registry
	}
}
