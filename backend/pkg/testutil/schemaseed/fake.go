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
	"fmt"
	"net/http"
	"strings"

	"github.com/twmb/franz-go/pkg/sr"
	"github.com/twmb/franz-go/pkg/sr/srfake"
)

// Fake returns the fixture and a fake registry that holds its schemas. The
// records are not produced anywhere.
func Fake(opts ...Option) (*Fixture, *srfake.Registry, error) {
	o := newOptions(opts)
	schemas := newSchemas(o.idBase)

	registry := srfake.New()
	for _, s := range schemas {
		registry.SeedSchema(s.QualifiedSubject(), 1, s.ID, s.registrySchema())
		seeded, _ := registry.GetSchema(s.QualifiedSubject(), 1)
		s.GUID = seeded.GUID
	}
	scenarios, err := buildScenarios(schemas, o.idBase)
	if err == nil {
		err = softDelete(registry, schemas)
	}
	if err != nil {
		registry.Close()
		return nil, nil, err
	}
	return &Fixture{Schemas: schemas, Topics: topicContexts, Scenarios: scenarios}, registry, nil
}

// softDelete soft-deletes the subjects that the fixture marks, as Seed does.
func softDelete(registry *srfake.Registry, schemas []*Schema) error {
	client, err := sr.NewClient(sr.URLs(registry.URL()))
	if err != nil {
		return err
	}
	for _, s := range schemas {
		if !s.SoftDelete {
			continue
		}
		if _, err := client.DeleteSubject(context.Background(), s.QualifiedSubject(), sr.SoftDelete); err != nil {
			return fmt.Errorf("soft-deleting %s: %w", s.QualifiedSubject(), err)
		}
	}
	return nil
}

// DisableGUIDRoutes makes the registry answer GUID lookups like a broker older
// than 26.3, which has no GUID routes.
func DisableGUIDRoutes(registry *srfake.Registry) {
	registry.Intercept(func(w http.ResponseWriter, r *http.Request) bool {
		if !strings.HasPrefix(r.URL.Path, "/schemas/guids/") {
			return false
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"message":"Not found","code":404}`))
		return true
	})
}
