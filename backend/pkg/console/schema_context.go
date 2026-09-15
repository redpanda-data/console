// Copyright 2026 Redpanda Data, Inc.
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
	"log/slog"

	"github.com/twmb/franz-go/pkg/kadm"

	schemacache "github.com/redpanda-data/console/backend/pkg/schema"
)

// topicSchemaContext returns the topic's redpanda.schema.registry.context, or "".
func topicSchemaContext(configs []kadm.Config) string {
	for _, c := range configs {
		if c.Key == schemacache.TopicConfigSchemaRegistryContext {
			return schemacache.NormalizeContextName(c.MaybeValue())
		}
	}
	return ""
}

// schemaContextForTopic reads the topic's schema registry context via DescribeConfigs.
func schemaContextForTopic(ctx context.Context, adminCl *kadm.Client, topic string) (string, error) {
	rcs, err := adminCl.DescribeTopicConfigs(ctx, topic)
	if err != nil {
		return "", err
	}
	rc, err := rcs.On(topic, nil)
	if err != nil {
		return "", err
	}
	if rc.Err != nil {
		return "", rc.Err
	}
	return topicSchemaContext(rc.Configs), nil
}

// resolveTopicSchemaContext returns the topic's schema registry context. Lookup
// failures are logged and fall back to the default context.
func (s *Service) resolveTopicSchemaContext(ctx context.Context, adminCl *kadm.Client, topic string) string {
	if !s.cfg.SchemaRegistry.Enabled {
		return ""
	}

	schemaCtx, err := schemaContextForTopic(ctx, adminCl, topic)
	if err != nil {
		s.logger.WarnContext(ctx, "failed to determine the topic's schema registry context, using the default context",
			slog.String("topic", topic),
			slog.Any("error", err))
		return ""
	}
	if schemaCtx != "" {
		s.logger.DebugContext(ctx, "resolving schemas in the topic's schema registry context",
			slog.String("topic", topic),
			slog.String("schema_context", schemaCtx))
	}
	return schemaCtx
}
