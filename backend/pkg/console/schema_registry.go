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
	"errors"
	"fmt"
	"strconv"

	"go.uber.org/zap"
	"golang.org/x/exp/slices"
	"golang.org/x/sync/errgroup"

	"github.com/redpanda-data/console/backend/pkg/schema"
)

// SchemaRegistryMode returns the schema registry mode.
type SchemaRegistryMode struct {
	Mode string `json:"mode"`
}

// SchemaRegistryConfig returns the global schema registry config.
type SchemaRegistryConfig struct {
	Compatibility schema.CompatibilityLevel `json:"compatibility"`
}

// SchemaRegistrySubject is the subject name along with a bool that
// indicates whether the subject is active or soft-deleted.
type SchemaRegistrySubject struct {
	Name          string `json:"name"`
	IsSoftDeleted bool   `json:"isSoftDeleted"`
}

// GetSchemaRegistryMode retrieves the schema registry mode.
func (s *Service) GetSchemaRegistryMode(ctx context.Context) (*SchemaRegistryMode, error) {
	mode, err := s.kafkaSvc.SchemaService.GetMode(ctx)
	if err != nil {
		return nil, err
	}
	return &SchemaRegistryMode{Mode: mode.Mode}, nil
}

// GetSchemaRegistryConfig returns the schema registry config which currently
// only contains the global compatibility config (e.g. "BACKWARD").
func (s *Service) GetSchemaRegistryConfig(ctx context.Context) (*SchemaRegistryConfig, error) {
	config, err := s.kafkaSvc.SchemaService.GetConfig(ctx)
	if err != nil {
		return nil, err
	}
	return &SchemaRegistryConfig{Compatibility: config.Compatibility}, nil
}

// PutSchemaRegistryConfig sets the global compatibility level.
func (s *Service) PutSchemaRegistryConfig(ctx context.Context, compatLevel schema.CompatibilityLevel) (*SchemaRegistryConfig, error) {
	config, err := s.kafkaSvc.SchemaService.PutConfig(ctx, compatLevel)
	if err != nil {
		return nil, err
	}
	return &SchemaRegistryConfig{Compatibility: config.Compatibility}, nil
}

// PutSchemaRegistrySubjectConfig sets the subject's compatibility level.
func (s *Service) PutSchemaRegistrySubjectConfig(ctx context.Context, subject string, compatLevel schema.CompatibilityLevel) (*SchemaRegistryConfig, error) {
	config, err := s.kafkaSvc.SchemaService.PutSubjectConfig(ctx, subject, compatLevel)
	if err != nil {
		return nil, err
	}
	return &SchemaRegistryConfig{Compatibility: config.Compatibility}, nil
}

// DeleteSchemaRegistrySubjectConfig deletes the subject's compatibility level.
func (s *Service) DeleteSchemaRegistrySubjectConfig(ctx context.Context, subject string) (*SchemaRegistryConfig, error) {
	config, err := s.kafkaSvc.SchemaService.DeleteSubjectConfig(ctx, subject)
	if err != nil {
		return nil, err
	}
	return &SchemaRegistryConfig{Compatibility: config.Compatibility}, nil
}

// GetSchemaRegistrySubjects returns a list of all register subjects. The list includes
// soft-deleted subjects.
func (s *Service) GetSchemaRegistrySubjects(ctx context.Context) ([]SchemaRegistrySubject, error) {
	subjects := make(map[string]struct{})
	subjectsWithDeleted := make(map[string]struct{})

	grp, _ := errgroup.WithContext(ctx)
	grp.Go(func() error {
		res, err := s.kafkaSvc.SchemaService.GetSubjects(ctx, false)
		if err != nil {
			return err
		}
		for _, subject := range res.Subjects {
			subjects[subject] = struct{}{}
		}
		return nil
	})
	grp.Go(func() error {
		res, err := s.kafkaSvc.SchemaService.GetSubjects(ctx, true)
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

// SchemaRegistrySubjectDetails represents a schema registry subject along
// with other information such as the registered versions that belong to it,
// or the full schema information that's part of the subject.
type SchemaRegistrySubjectDetails struct {
	Name                string                                `json:"name"`
	Type                schema.SchemaType                     `json:"type"`
	Compatibility       schema.CompatibilityLevel             `json:"compatibility"`
	RegisteredVersions  []SchemaRegistrySubjectDetailsVersion `json:"versions"`
	LatestActiveVersion int                                   `json:"latestActiveVersion"`
	Schemas             []*SchemaRegistryVersionedSchema      `json:"schemas"`
}

const (
	// SchemaVersionsAll can be specified as version to retrieve all schema versions.
	SchemaVersionsAll string = "all"
	// SchemaVersionsLatest can be specified as version to retrieve the latest active schema.
	SchemaVersionsLatest string = "latest"
)

// GetSchemaRegistrySubjectDetails retrieves the schema details for the given subject, version tuple.
// Use version = 'latest' to retrieve the latest schema.
// Use version = 'all' to retrieve all schemas for this subject.
// Use version = 3 to retrieve the specific version for the given subject
func (s *Service) GetSchemaRegistrySubjectDetails(ctx context.Context, subjectName, version string) (*SchemaRegistrySubjectDetails, error) {
	// 1. Retrieve all schema versions registered for the given subject
	versions, err := s.getSchemaRegistrySchemaVersions(ctx, subjectName)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve subject versions: %w", err)
	}
	latestActiveVersion := -1
	softDeletedVersions := make(map[int]bool)
	for _, v := range versions {
		if v.IsSoftDeleted {
			softDeletedVersions[v.Version] = true
			continue
		}
		if v.Version > latestActiveVersion {
			latestActiveVersion = v.Version
		}
	}

	// 2. Retrieve schemas and compat level concurrently
	var compatLevel schema.CompatibilityLevel

	grp, grpCtx := errgroup.WithContext(ctx)

	grp.Go(func() error {
		// 2. Retrieve subject config (subject compatibility level)
		configRes, err := s.kafkaSvc.SchemaService.GetSubjectConfig(grpCtx, subjectName)
		if err != nil {
			s.logger.Warn("failed to get subject config", zap.String("subject", subjectName), zap.Error(err))
			return nil
		}
		compatLevel = configRes.Compatibility
		return nil
	})

	// If version 'all' request schemas for all versions individually
	versionsToRetrieve := []string{version}
	if version == SchemaVersionsAll {
		versionsToRetrieve = make([]string, len(versions))
		for i, v := range versions {
			versionsToRetrieve[i] = strconv.Itoa(v.Version)
		}
	}

	schemasCh := make(chan *SchemaRegistryVersionedSchema, len(versionsToRetrieve))
	for _, v := range versionsToRetrieve {
		copiedVersion := v
		grp.Go(func() error {
			schemaRes, err := s.GetSchemaRegistrySchema(ctx, subjectName, copiedVersion, true)
			if err != nil {
				return fmt.Errorf("failed to retrieve version %q", copiedVersion)
			}
			// To avoid making further requests to figure out whether this is a soft-deleted
			// schema or not we are looking up this piece of information in our existing
			// versions map.
			schemaRes.IsSoftDeleted = softDeletedVersions[schemaRes.Version]
			schemasCh <- schemaRes
			return nil
		})
	}

	if err := grp.Wait(); err != nil {
		return nil, err
	}
	close(schemasCh)

	// Send requests to retrieve schemas
	schemas := make([]*SchemaRegistryVersionedSchema, 0)
	for schemaRes := range schemasCh {
		schemas = append(schemas, schemaRes)
	}

	var schemaType schema.SchemaType
	if len(schemas) > 0 {
		schemaType = schemas[len(schemas)-1].Type
	}

	return &SchemaRegistrySubjectDetails{
		Name:                subjectName,
		Type:                schemaType,
		Compatibility:       compatLevel,
		RegisteredVersions:  versions,
		LatestActiveVersion: latestActiveVersion,
		Schemas:             schemas,
	}, nil
}

// SchemaRegistrySubjectDetailsVersion represents a schema version and if it's
// soft-deleted or not.
type SchemaRegistrySubjectDetailsVersion struct {
	Version       int  `json:"version"`
	IsSoftDeleted bool `json:"isSoftDeleted"`
}

// getSchemaRegistrySchemaVersions fetches the versions that exist for a given subject.
// This will submit two versions requests where one includes softDeletedVersions.
// This is done to retrieve a list with all versions including a flag whether it's
// a soft-deleted or active version.
func (s *Service) getSchemaRegistrySchemaVersions(ctx context.Context, subjectName string) ([]SchemaRegistrySubjectDetailsVersion, error) {
	activeVersions := make(map[int]struct{})
	versionsWithSoftDeleted := make(map[int]struct{})

	g, _ := errgroup.WithContext(ctx)

	// 1. Get versions without soft-deleted
	g.Go(func() error {
		versionsRes, err := s.kafkaSvc.SchemaService.GetSubjectVersions(ctx, subjectName, false)
		if err != nil {
			var schemaError *schema.RestError
			if errors.As(err, &schemaError) && schemaError.ErrorCode == 40401 {
				// It's expected to get an error here if the targeted subject
				// is soft-deleted (Subject not found / errcode 40401).
				return nil
			}
			return fmt.Errorf("failed to retrieve subject versions (without soft-deleted): %w", err)
		}

		for _, v := range versionsRes.Versions {
			activeVersions[v] = struct{}{}
		}
		return nil
	})

	// 2. Get versions with soft-deleted
	g.Go(func() error {
		versionsRes, err := s.kafkaSvc.SchemaService.GetSubjectVersions(ctx, subjectName, true)
		if err != nil {
			return fmt.Errorf("failed to retrieve subject versions (with soft-deleted): %w", err)
		}

		for _, v := range versionsRes.Versions {
			versionsWithSoftDeleted[v] = struct{}{}
		}
		return nil
	})

	err := g.Wait()
	if err != nil {
		return nil, err
	}

	// 3. Construct response where we can tell what activeVersions are soft-deleted and which aren't
	response := make([]SchemaRegistrySubjectDetailsVersion, 0, len(versionsWithSoftDeleted))
	for v := range versionsWithSoftDeleted {
		_, exists := activeVersions[v]
		response = append(response, SchemaRegistrySubjectDetailsVersion{
			Version:       v,
			IsSoftDeleted: !exists,
		})
	}
	slices.SortFunc(response, func(a, b SchemaRegistrySubjectDetailsVersion) bool {
		return a.Version < b.Version
	})

	return response, nil
}

// SchemaRegistryVersionedSchema describes a retrieved schema.
type SchemaRegistryVersionedSchema struct {
	ID            int               `json:"id"`
	Version       int               `json:"version"`
	IsSoftDeleted bool              `json:"isSoftDeleted"`
	Type          schema.SchemaType `json:"type"`
	Schema        string            `json:"schema"`
	References    []Reference       `json:"references"`
}

// Reference describes a reference to a different schema stored in the schema registry.
type Reference struct {
	Name    string `json:"name"`
	Subject string `json:"subject"`
	Version int    `json:"version"`
}

// GetSchemaRegistrySchema retrieves a schema for a given subject, version tuple from the
// schema registry.
func (s *Service) GetSchemaRegistrySchema(ctx context.Context, subjectName, version string, showSoftDeleted bool) (*SchemaRegistryVersionedSchema, error) {
	latestSchema, err := s.kafkaSvc.SchemaService.GetSchemaBySubject(ctx, subjectName, version, showSoftDeleted)
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

// SchemaReference return all schema ids that reference the requested subject-version.
type SchemaReference struct {
	SchemaID int           `json:"schemaId"`
	Error    string        `json:"error,omitempty"`
	Usages   []SchemaUsage `json:"usages"`
}

// SchemaUsage is the subject-version that uses this schema id.
type SchemaUsage struct {
	Subject string `json:"subject"`
	Version int    `json:"version"`
}

// GetSchemaRegistrySchemaReferencedBy returns all schema ids that references the input
// subject-version. You can use -1 or 'latest' to check the latest version.
func (s *Service) GetSchemaRegistrySchemaReferencedBy(ctx context.Context, subjectName, version string) ([]SchemaReference, error) {
	schemaRefs, err := s.kafkaSvc.SchemaService.GetSchemaReferences(ctx, subjectName, version)
	if err != nil {
		return nil, err
	}

	ch := make(chan SchemaReference, len(schemaRefs.SchemaIDs))
	grp, grpCtx := errgroup.WithContext(ctx)
	for _, schemaID := range schemaRefs.SchemaIDs {
		schemaIDCpy := schemaID
		grp.Go(func() error {
			subjectVersions, err := s.kafkaSvc.SchemaService.GetSchemaUsagesByID(grpCtx, schemaIDCpy)
			if err != nil {
				ch <- SchemaReference{
					Error: err.Error(),
				}
				return nil
			}

			usages := make([]SchemaUsage, len(subjectVersions))
			for i, subjectVersion := range subjectVersions {
				usages[i] = SchemaUsage{
					Subject: subjectVersion.Subject,
					Version: subjectVersion.Version,
				}
			}

			ch <- SchemaReference{
				SchemaID: schemaIDCpy,
				Usages:   usages,
			}
			return nil
		})
	}
	if err := grp.Wait(); err != nil {
		return nil, err
	}
	close(ch)

	response := make([]SchemaReference, 0, len(schemaRefs.SchemaIDs))
	for schemaRef := range ch {
		response = append(response, schemaRef)
	}

	return response, nil
}

// SchemaRegistryDeleteSubjectResponse is the response to deleting a whole schema registry subject.
type SchemaRegistryDeleteSubjectResponse struct {
	DeletedVersions []int `json:"deletedVersions"`
}

// DeleteSchemaRegistrySubject deletes a schema registry subject along with all it's associated schemas.
func (s *Service) DeleteSchemaRegistrySubject(ctx context.Context, subjectName string, deletePermanently bool) (*SchemaRegistryDeleteSubjectResponse, error) {
	res, err := s.kafkaSvc.SchemaService.DeleteSubject(ctx, subjectName, deletePermanently)
	if err != nil {
		return nil, err
	}
	return &SchemaRegistryDeleteSubjectResponse{DeletedVersions: res.Versions}, nil
}

// SchemaRegistryDeleteSubjectVersionResponse is the response to deleting a subject version.
type SchemaRegistryDeleteSubjectVersionResponse struct {
	DeletedVersion int `json:"deletedVersion"`
}

// DeleteSchemaRegistrySubjectVersion deletes a schema registry subject version.
func (s *Service) DeleteSchemaRegistrySubjectVersion(ctx context.Context, subjectName, version string, deletePermanently bool) (*SchemaRegistryDeleteSubjectVersionResponse, error) {
	res, err := s.kafkaSvc.SchemaService.DeleteSubjectVersion(ctx, subjectName, version, deletePermanently)
	if err != nil {
		return nil, err
	}
	return &SchemaRegistryDeleteSubjectVersionResponse{DeletedVersion: res.Version}, nil
}

// SchemaRegistrySchemaTypes describe the schema types that are supported by the schema registry.
type SchemaRegistrySchemaTypes struct {
	SchemaTypes []string `json:"schemaTypes"`
}

// GetSchemaRegistrySchemaTypes returns the supported schema types.
func (s *Service) GetSchemaRegistrySchemaTypes(ctx context.Context) (*SchemaRegistrySchemaTypes, error) {
	res, err := s.kafkaSvc.SchemaService.GetSchemaTypes(ctx)
	if err != nil {
		return nil, err
	}
	return &SchemaRegistrySchemaTypes{SchemaTypes: res}, nil
}

// CreateSchemaResponse is the response to creating a new schema.
type CreateSchemaResponse struct {
	ID int `json:"id"`
}

// CreateSchemaRegistrySchema registers a new schema for the given subject in the schema registry.
func (s *Service) CreateSchemaRegistrySchema(ctx context.Context, subjectName string, schema schema.Schema) (*CreateSchemaResponse, error) {
	res, err := s.kafkaSvc.SchemaService.CreateSchema(ctx, subjectName, schema)
	if err != nil {
		return nil, err
	}

	return &CreateSchemaResponse{ID: res.ID}, nil
}

// SchemaRegistrySchemaValidation is the response to a schema validation.
type SchemaRegistrySchemaValidation struct {
	Compatibility SchemaRegistrySchemaValidationCompatibility `json:"compatibility"`
	ParsingError  string                                      `json:"parsingError,omitempty"`
	IsValid       bool                                        `json:"isValid"`
}

// SchemaRegistrySchemaValidationCompatibility is the response to the compatibility check
// performed by the schema registry.
type SchemaRegistrySchemaValidationCompatibility struct {
	IsCompatible bool   `json:"isCompatible"`
	Error        string `json:"error,omitempty"`
}

// ValidateSchemaRegistrySchema validates a given schema by checking:
// 1. Compatibility to previous versions if they exist.
// 2. Validating the schema for correctness.
func (s *Service) ValidateSchemaRegistrySchema(
	ctx context.Context,
	subjectName string,
	version string,
	sch schema.Schema,
) *SchemaRegistrySchemaValidation {
	// Compatibility check from schema registry
	var compatErr string
	var isCompatible bool
	compatRes, err := s.kafkaSvc.SchemaService.CheckCompatibility(ctx, subjectName, version, sch)
	if err != nil {
		compatErr = err.Error()

		// If subject doesn't exist, we will reset the error, because new subject schemas
		// don't have any existing schema and therefore can't be incompatible.
		var schemaErr *schema.RestError
		if errors.As(err, &schemaErr) {
			if schemaErr.ErrorCode == schema.CodeSubjectNotFound {
				compatErr = ""
				isCompatible = true
			}
		}
	} else {
		isCompatible = compatRes.IsCompatible
	}

	var parsingErr string
	switch sch.Type {
	case schema.TypeAvro:
		if err := s.kafkaSvc.SchemaService.ValidateAvroSchema(ctx, sch); err != nil {
			parsingErr = err.Error()
		}
	case schema.TypeJSON:
		if err := s.kafkaSvc.SchemaService.ValidateJSONSchema(ctx, subjectName, sch, nil); err != nil {
			parsingErr = err.Error()
		}
	case schema.TypeProtobuf:
		if err := s.kafkaSvc.SchemaService.ValidateProtobufSchema(ctx, subjectName, sch); err != nil {
			parsingErr = err.Error()
		}
	}

	return &SchemaRegistrySchemaValidation{
		Compatibility: SchemaRegistrySchemaValidationCompatibility{
			IsCompatible: isCompatible,
			Error:        compatErr,
		},
		ParsingError: parsingErr,
		IsValid:      parsingErr == "" && isCompatible,
	}
}

// SchemaVersion is the response to requesting schema usages by a global schema id.
type SchemaVersion struct {
	Subject string `json:"subject"`
	Version int    `json:"version"`
}

// GetSchemaUsagesByID registers a new schema for the given subject in the schema registry.
func (s *Service) GetSchemaUsagesByID(ctx context.Context, schemaID int) ([]SchemaVersion, error) {
	res, err := s.kafkaSvc.SchemaService.GetSchemaUsagesByID(ctx, schemaID)
	if err != nil {
		return nil, err
	}

	schemaVersions := make([]SchemaVersion, len(res))
	for i, r := range res {
		schemaVersions[i] = SchemaVersion{
			Subject: r.Subject,
			Version: r.Version,
		}
	}

	return schemaVersions, nil
}
