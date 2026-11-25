// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package schemaseed

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
)

const topicConfigSchemaRegistryContext = "redpanda.schema.registry.context"

type options struct {
	idBase      int
	topicPrefix string
}

// Option configures the fixture.
type Option func(*options)

// WithIDBase makes the schema IDs base+1 to base+4 in each context. Use it on
// a registry that already holds schemas with low IDs.
func WithIDBase(base int) Option {
	return func(o *options) { o.idBase = base }
}

// WithTopicPrefix prefixes the name of every topic that Seed creates.
func WithTopicPrefix(prefix string) Option {
	return func(o *options) { o.topicPrefix = prefix }
}

func newOptions(opts []Option) options {
	var o options
	for _, opt := range opts {
		opt(&o)
	}
	return o
}

// Seed registers the fixture schemas with fixed IDs, creates the topics and
// produces one record per scenario. It needs a registry with schema GUIDs
// (Redpanda 26.3 or later).
func Seed(ctx context.Context, kafka *kgo.Client, adm *kadm.Client, reg *sr.Client, opts ...Option) (*Fixture, error) {
	o := newOptions(opts)
	schemas := newSchemas(o.idBase)

	for _, s := range schemas {
		if err := register(ctx, reg, s); err != nil {
			return nil, err
		}
	}

	scenarios, err := buildScenarios(schemas, o.idBase)
	if err != nil {
		return nil, err
	}

	for topic, schemaContext := range topicContexts {
		var configs map[string]*string
		if schemaContext != ContextDefault {
			configs = map[string]*string{topicConfigSchemaRegistryContext: &schemaContext}
		}
		if _, err := adm.CreateTopic(ctx, 1, -1, configs, o.topicPrefix+topic); err != nil {
			return nil, fmt.Errorf("creating topic %s: %w", topic, err)
		}
	}

	for _, sc := range scenarios {
		sc.Record.Topic = o.topicPrefix + sc.Topic
		if err := kafka.ProduceSync(ctx, sc.Record).FirstErr(); err != nil {
			return nil, fmt.Errorf("producing %s %q: %w", sc.Topic, sc.Name, err)
		}
	}

	for _, s := range schemas {
		if !s.SoftDelete {
			continue
		}
		if _, err := reg.DeleteSubject(ctx, s.QualifiedSubject(), sr.SoftDelete); err != nil {
			return nil, fmt.Errorf("soft-deleting %s: %w", s.QualifiedSubject(), err)
		}
	}

	return &Fixture{Schemas: schemas, Topics: topicContexts, Scenarios: scenarios}, nil
}

// register creates the schema with its fixed ID through IMPORT mode and reads
// back its GUID.
func register(ctx context.Context, reg *sr.Client, s *Schema) error {
	subject := s.QualifiedSubject()
	if err := setMode(ctx, reg, sr.ModeImport, subject); err != nil {
		return err
	}
	if _, err := reg.RegisterSchema(ctx, subject, s.registrySchema(), s.ID, -1); err != nil {
		return fmt.Errorf("registering %s with ID %d: %w", subject, s.ID, err)
	}
	if err := setMode(ctx, reg, sr.ModeReadWrite, subject); err != nil {
		return err
	}

	registered, err := reg.SchemaByVersion(ctx, subject, -1)
	if err != nil {
		return fmt.Errorf("reading back %s: %w", subject, err)
	}
	if registered.ID != s.ID {
		return fmt.Errorf("%s got ID %d, want %d", subject, registered.ID, s.ID)
	}
	if registered.GUID == "" {
		return fmt.Errorf("the registry returned no GUID for %s, it needs Redpanda 26.3 or later", subject)
	}
	s.GUID = registered.GUID
	return nil
}

func setMode(ctx context.Context, reg *sr.Client, mode sr.Mode, subject string) error {
	for _, res := range reg.SetMode(ctx, mode, subject) {
		if res.Err != nil {
			return fmt.Errorf("setting mode %s on %s: %w", mode, subject, res.Err)
		}
	}
	return nil
}

// Reset deletes the topics and subjects that Seed creates. Missing ones are
// ignored.
func Reset(ctx context.Context, adm *kadm.Client, reg *sr.Client, opts ...Option) error {
	o := newOptions(opts)

	topics := make([]string, 0, len(topicContexts))
	for topic := range topicContexts {
		topics = append(topics, o.topicPrefix+topic)
	}
	if _, err := adm.DeleteTopics(ctx, topics...); err != nil {
		return fmt.Errorf("deleting topics: %w", err)
	}

	schemas := newSchemas(o.idBase)
	slices.Reverse(schemas)
	var errs []error
	for _, s := range schemas {
		subject := s.QualifiedSubject()
		_, _ = reg.DeleteSubject(ctx, subject, sr.SoftDelete)
		if _, err := reg.DeleteSubject(ctx, subject, sr.HardDelete); err != nil && !isNotFound(err) {
			errs = append(errs, fmt.Errorf("deleting %s: %w", subject, err))
		}
		reg.ResetMode(ctx, subject)
	}
	return errors.Join(errs...)
}

func isNotFound(err error) bool {
	var respErr *sr.ResponseError
	return errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound
}
