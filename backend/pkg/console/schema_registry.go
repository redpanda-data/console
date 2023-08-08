// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"

	"golang.org/x/exp/slices"
	"golang.org/x/sync/errgroup"
)

// SchemaRegistryMode returns the schema registry mode.
type SchemaRegistryMode struct {
	Mode string `json:"mode"`
}

// SchemaRegistryConfig returns the global schema registry config.
type SchemaRegistryConfig struct {
	Compatibility string `json:"compatibility"`
}

type SchemaRegistrySubject struct {
	Name          string `json:"name"`
	IsSoftDeleted bool   `json:"isSoftDeleted"`
}

// GetSchemaRegistryMode retrieves the schema registry mode.
func (s *Service) GetSchemaRegistryMode(_ context.Context) (*SchemaRegistryMode, error) {
	mode, err := s.kafkaSvc.SchemaService.GetMode()
	if err != nil {
		return nil, err
	}
	return &SchemaRegistryMode{Mode: mode.Mode}, nil
}

func (s *Service) GetSchemaRegistryConfig(_ context.Context) (*SchemaRegistryConfig, error) {
	config, err := s.kafkaSvc.SchemaService.GetConfig()
	if err != nil {
		return nil, err
	}
	return &SchemaRegistryConfig{Compatibility: config.Compatibility}, nil
}

func (s *Service) GetSchemaRegistrySubjects(ctx context.Context) ([]SchemaRegistrySubject, error) {
	subjects := make(map[string]struct{})
	subjectsWithDeleted := make(map[string]struct{})

	grp, ctx := errgroup.WithContext(ctx)
	grp.Go(func() error {
		res, err := s.kafkaSvc.SchemaService.GetSubjects(false)
		if err != nil {
			return err
		}
		for _, subject := range res.Subjects {
			subjects[subject] = struct{}{}
		}
		return nil
	})
	grp.Go(func() error {
		res, err := s.kafkaSvc.SchemaService.GetSubjects(true)
		if err != nil {
			return err
		}
		for _, subject := range res.Subjects {
			subjectsWithDeleted[subject] = struct{}{}
		}
		return nil
	})
	if err := grp.Wait(); err != nil {
		return nil, err
	}

	result := make([]SchemaRegistrySubject, 0, len(subjectsWithDeleted))
	for subj := range subjectsWithDeleted {
		_, exists := subjects[subj]
		result = append(result, SchemaRegistrySubject{
			Name:          subj,
			IsSoftDeleted: !exists,
		})
	}

	// Sort for stable results in UI
	slices.SortFunc(result, func(a, b SchemaRegistrySubject) bool {
		return a.Name < b.Name
	})

	return result, nil
}

type SchemaRegistrySubjectDetails struct {
	Name               string                           `json:"name"`
	Type               string                           `json:"type"`
	Compatibility      string                           `json:"compatibility"`
	RegisteredVersions []int                            `json:"totalVersions"`
	LatestVersion      int                              `json:"latestVersion"`
	Schemas            []*SchemaRegistryVersionedSchema `json:"schemas"`
}

// GetSchemaRegistrySubjectDetails retrieves the schema details for the given subject, version tuple.
// Use version = 'latest' to retrieve the latest schema.
// Use version = 'all' to retrieve all schemas for this subject.
// Use version = 3 to retrieve the specific version for the given subject
func (s *Service) GetSchemaRegistrySubjectDetails(ctx context.Context, subjectName string, version string) (*SchemaRegistrySubjectDetails, error) {
	versionsRes, err := s.kafkaSvc.SchemaService.GetSubjectVersions(subjectName, true)
	if err != nil {
		return nil, err
	}

	configRes, err := s.kafkaSvc.SchemaService.GetSubjectConfig(subjectName)
	if err != nil {
		return nil, err
	}

	// TODO: Handle version all
	latestSchema, err := s.GetSchemaRegistrySchema(ctx, subjectName, version)
	if err != nil {
		return nil, err
	}

	return &SchemaRegistrySubjectDetails{
		Name:               subjectName,
		Type:               latestSchema.Type,
		Compatibility:      configRes.Compatibility,
		RegisteredVersions: versionsRes.Versions,
		LatestVersion:      versionsRes.Versions[len(versionsRes.Versions)-1],
		Schemas:            []*SchemaRegistryVersionedSchema{latestSchema},
	}, nil
}

// SchemaRegistryVersionedSchema describes a retrieved schema.
type SchemaRegistryVersionedSchema struct {
	ID         int         `json:"id"`
	Version    int         `json:"version"`
	Type       string      `json:"type"`
	Schema     string      `json:"schema"`
	References []Reference `json:"references"`
}

// Reference describes a reference to a different schema stored in the schema registry.
type Reference struct {
	Name    string `json:"name"`
	Subject string `json:"subject"`
	Version int    `json:"version"`
}

// GetSchemaRegistrySchema retrieves a schema for a given subject, version tuple from the
// schema registry.
func (s *Service) GetSchemaRegistrySchema(_ context.Context, subjectName, version string) (*SchemaRegistryVersionedSchema, error) {
	latestSchema, err := s.kafkaSvc.SchemaService.GetSchemaBySubject(subjectName, version)
	if err != nil {
		return nil, err
	}

	references := make([]Reference, len(latestSchema.References))
	for i, ref := range latestSchema.References {
		references[i] = Reference{
			Name:    ref.Name,
			Subject: ref.Subject,
			Version: ref.Version,
		}
	}

	return &SchemaRegistryVersionedSchema{
		ID:         latestSchema.SchemaID,
		Version:    latestSchema.Version,
		Type:       latestSchema.Type,
		Schema:     latestSchema.Schema,
		References: references,
	}, nil
}
