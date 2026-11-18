// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"errors"
	"time"
)

// GlueSchemaRegistry is the configuration for using the AWS Glue Schema Registry
// as a schema source for deserializing records.
//
// Credentials are resolved through the default AWS credential chain (environment
// variables, shared config files, EC2/ECS instance metadata, IRSA), so no
// credentials are accepted here.
//
// No registry name is configured because schemas are resolved by the schema
// version id embedded in each record, which is unique across all registries.
type GlueSchemaRegistry struct {
	Enabled bool `yaml:"enabled"`

	// Region is the AWS region the Glue Schema Registry lives in, such as
	// us-east-1. Required when enabled.
	Region string `yaml:"region"`

	// Endpoint optionally overrides the resolved Glue API endpoint. This is
	// mostly useful for testing against a Glue-compatible mock.
	Endpoint string `yaml:"endpoint"`

	// CacheTTL is how long a resolved schema is cached before it is fetched
	// from the Glue API again. Schema versions in Glue are immutable, so this
	// can safely be generous.
	CacheTTL time.Duration `yaml:"cacheTtl"`

	// ClientTimeout is the request timeout applied to Glue API calls.
	ClientTimeout time.Duration `yaml:"clientTimeout"`
}

// SetDefaults for the AWS Glue Schema Registry configuration.
func (c *GlueSchemaRegistry) SetDefaults() {
	c.CacheTTL = 1 * time.Hour
	c.ClientTimeout = 10 * time.Second
}

// Validate the AWS Glue Schema Registry configuration.
func (c *GlueSchemaRegistry) Validate() error {
	if !c.Enabled {
		return nil
	}

	if c.Region == "" {
		return errors.New("AWS Glue Schema Registry is enabled but no region is configured")
	}

	if c.CacheTTL < 0 {
		return errors.New("AWS Glue Schema Registry cacheTtl must not be negative")
	}

	if c.ClientTimeout < 0 {
		return errors.New("AWS Glue Schema Registry clientTimeout must not be negative")
	}

	return nil
}
