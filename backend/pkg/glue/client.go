// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package glue provides a cached client for the AWS Glue Schema Registry.
// Schemas are resolved by the schema version id that the AWS serializers embed
// in every record they write.
package glue

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/glue"
	gluetypes "github.com/aws/aws-sdk-go-v2/service/glue/types"
	"github.com/twmb/avro"
	"github.com/twmb/go-cache/cache"

	"github.com/redpanda-data/console/backend/pkg/config"
)

// SchemaVersionGetter is the subset of the AWS Glue API that this client needs.
// It is an interface so tests can supply a fake without reaching AWS.
type SchemaVersionGetter interface {
	GetSchemaVersion(ctx context.Context, params *glue.GetSchemaVersionInput, optFns ...func(*glue.Options)) (*glue.GetSchemaVersionOutput, error)
}

// Client resolves and caches Avro schemas from the AWS Glue Schema Registry.
type Client struct {
	api    SchemaVersionGetter
	logger *slog.Logger

	// Glue schema versions are immutable, so a parsed schema stays valid for
	// as long as we care to keep it.
	cache *cache.Cache[string, *avro.Schema]
}

// NewClient creates a new AWS Glue Schema Registry client. Credentials are
// resolved through the default AWS credential chain.
func NewClient(ctx context.Context, cfg config.GlueSchemaRegistry, logger *slog.Logger) (*Client, error) {
	if !cfg.Enabled {
		return nil, errors.New("AWS Glue Schema Registry is not enabled")
	}

	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("invalid AWS Glue Schema Registry config: %w", err)
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithHTTPClient(&http.Client{Timeout: cfg.ClientTimeout}),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	var apiOpts []func(*glue.Options)
	if cfg.Endpoint != "" {
		apiOpts = append(apiOpts, func(o *glue.Options) {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
		})
	}

	return NewClientWithAPI(glue.NewFromConfig(awsCfg, apiOpts...), cfg, logger), nil
}

// NewClientWithAPI creates a client around an already constructed Glue API.
// This is the seam used by tests.
func NewClientWithAPI(api SchemaVersionGetter, cfg config.GlueSchemaRegistry, logger *slog.Logger) *Client {
	if logger == nil {
		logger = slog.New(slog.DiscardHandler)
	}

	return &Client{
		api:    api,
		logger: logger,
		cache: cache.New[string, *avro.Schema](
			cache.MaxAge(cfg.CacheTTL),
			cache.MaxErrorAge(time.Minute),
			cache.AutoCleanInterval(30*time.Minute),
		),
	}
}

// AvroSchemaByVersionID fetches and parses the Avro schema for the given Glue
// schema version id. Results are cached, including failures for a short period.
func (c *Client) AvroSchemaByVersionID(ctx context.Context, schemaVersionID string) (*avro.Schema, error) {
	if schemaVersionID == "" {
		return nil, errors.New("schema version id is empty")
	}

	sch, err, state := c.cache.Get(schemaVersionID, func() (*avro.Schema, error) {
		return c.fetchAvroSchema(ctx, schemaVersionID)
	})
	if err != nil {
		c.logger.WarnContext(ctx, "failed to resolve avro schema from the AWS Glue Schema Registry",
			slog.String("schema_version_id", schemaVersionID),
			slog.Any("error", err))
		return nil, err
	}

	c.logger.DebugContext(ctx, "resolved avro schema from the AWS Glue Schema Registry",
		slog.String("schema_version_id", schemaVersionID),
		slog.Bool("cache_hit", state.IsHit()))

	return sch, nil
}

// fetchAvroSchema retrieves a schema version from Glue and parses it as Avro.
func (c *Client) fetchAvroSchema(ctx context.Context, schemaVersionID string) (*avro.Schema, error) {
	c.logger.DebugContext(ctx, "requesting schema version from the AWS Glue Schema Registry",
		slog.String("schema_version_id", schemaVersionID))

	out, err := c.api.GetSchemaVersion(ctx, &glue.GetSchemaVersionInput{
		SchemaVersionId: aws.String(schemaVersionID),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get schema version %q from AWS Glue: %w", schemaVersionID, err)
	}

	if out.DataFormat != gluetypes.DataFormatAvro {
		return nil, fmt.Errorf("schema version %q has data format %q, expected AVRO", schemaVersionID, out.DataFormat)
	}

	if out.SchemaDefinition == nil || *out.SchemaDefinition == "" {
		return nil, fmt.Errorf("schema version %q has an empty schema definition", schemaVersionID)
	}

	// Glue does not enforce the Avro strict name regex when a schema is
	// registered, so names that the spec rejects are common in the wild. CDC
	// producers in particular derive namespaces from database identifiers and
	// end up with hyphens, e.g. "some-db.public.some-table-v0". Rejecting
	// those here would make the schema unreadable even though AWS accepted it
	// and the producer wrote records against it. Names are only identifiers
	// for decoding and pass through verbatim, so relaxing the check is safe.
	sch, err := avro.Parse(*out.SchemaDefinition, avro.WithLaxNames(nil))
	if err != nil {
		return nil, fmt.Errorf("failed to parse avro schema for version %q: %w", schemaVersionID, err)
	}

	return sch, nil
}
