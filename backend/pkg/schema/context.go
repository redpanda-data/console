// Copyright 2026 Redpanda Data, Inc.
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
	"regexp"
	"strings"

	"github.com/twmb/franz-go/pkg/sr"
)

// TopicConfigSchemaRegistryContext is the topic property that binds a topic to
// a Schema Registry context.
const TopicConfigSchemaRegistryContext = "redpanda.schema.registry.context"

type schemaContextKey struct{}

// InContext scopes schema registry lookups to the given context. Empty or "."
// selects the default context.
func InContext(ctx context.Context, name string) context.Context {
	name = NormalizeContextName(name)
	ctx = context.WithValue(ctx, schemaContextKey{}, name)
	return sr.InContext(ctx, name)
}

// ContextName returns the context set by InContext, "" for the default.
func ContextName(ctx context.Context) string {
	name, ok := ctx.Value(schemaContextKey{}).(string)
	if !ok {
		return ""
	}
	return name
}

// NormalizeContextName returns the canonical ".name" form. "" and "." both
// mean the default context and become "", which franz-go leaves unprefixed.
func NormalizeContextName(name string) string {
	name = strings.Trim(strings.TrimSpace(name), ":")
	if name == "" || name == "." {
		return ""
	}
	if !strings.HasPrefix(name, ".") {
		return "." + name
	}
	return name
}

var qualifiedSubjectRegexp = regexp.MustCompile(`^:(\.[^:]*):`)

// ContextFromSubject returns the context of a qualified subject
// (":.ctx:subject"), "" for unqualified ones.
func ContextFromSubject(subject string) string {
	m := qualifiedSubjectRegexp.FindStringSubmatch(subject)
	if m == nil {
		return ""
	}
	return NormalizeContextName(m[1])
}
