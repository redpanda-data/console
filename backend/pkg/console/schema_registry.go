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
	"log/slog"
	"strconv"
	"strings"

	"github.com/redpanda-data/common-go/rpsr"
	"github.com/twmb/franz-go/pkg/sr"
	"golang.org/x/exp/slices"
	"golang.org/x/sync/errgroup"
)

// SchemaRegistryMode returns the schema registry mode.
type SchemaRegistryMode struct {
	Mode string `json:"mode"`
}

// SchemaRegistryConfig returns the global schema registry config.
type SchemaRegistryConfig struct {
	Compatibility sr.CompatibilityLevel `json:"compatibility"`
}

// SchemaRegistrySubject is the subject name along with a bool that
// indicates whether the subject is active or soft-deleted.
type SchemaRegistrySubject struct {
	Name          string `json:"name"`
	IsSoftDeleted bool   `json:"isSoftDeleted"`
}

// GetSchemaRegistryMode retrieves the schema registry mode.
func (s *Service) GetSchemaRegistryMode(ctx context.Context) (*SchemaRegistryMode, error) {
	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		return nil, err
	}

	modeResult := srClient.Mode(ctx)
	mode := modeResult[0]
	if err := mode.Err; err != nil {
		return nil, fmt.Errorf("failed to get mode: %w", err)
	}
	return &SchemaRegistryMode{Mode: mode.Mode.String()}, nil
}

// GetSchemaRegistryConfig returns the schema registry config which currently
// only return the global compatibility config (e.g. "BACKWARD"). The global
// compatibility can be set by using an empty subject.
func (s *Service) GetSchemaRegistryConfig(ctx context.Context, subject string) (*SchemaRegistryConfig, error) {
	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		return nil, err
	}
	compatibilityResult := srClient.Compatibility(ctx, subject)
	compatibility := compatibilityResult[0]
	if err := compatibility.Err; err != nil {
		return nil, fmt.Errorf("failed to get compatibility: %w", err)
	}

	return &SchemaRegistryConfig{Compatibility: compatibility.Level}, nil
}

// PutSchemaRegistryConfig sets the global compatibility level. The global
// compatibility can be set by either using an empty subject or by specifying no
// subjects.
func (s *Service) PutSchemaRegistryConfig(ctx context.Context, subject string, compat sr.SetCompatibility) (*SchemaRegistryConfig, error) {
	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		return nil, err
	}
	compatibilityResult := srClient.SetCompatibility(ctx, compat, subject)
	compatibility := compatibilityResult[0]
	if err := compatibility.Err; err != nil {
		return nil, fmt.Errorf("failed to set compatibility: %w", err)
	}

	return &SchemaRegistryConfig{Compatibility: compatibility.Level}, nil
}

// DeleteSchemaRegistrySubjectConfig deletes the subject's compatibility level.
// The global compatibility can be reset by either using an empty subject or by
// specifying no subjects.
func (s *Service) DeleteSchemaRegistrySubjectConfig(ctx context.Context, subject string) error {
	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		return err
	}
	compatibilityResult := srClient.ResetCompatibility(ctx, subject)
	compatibility := compatibilityResult[0]
	return compatibility.Err
}

// GetSchemaRegistrySubjects returns a list of all register subjects. The list includes
// soft-deleted subjects.
func (s *Service) GetSchemaRegistrySubjects(ctx context.Context) ([]SchemaRegistrySubject, error) {
	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		return nil, err
	}

	subjects := make(map[string]struct{})
	subjectsWithDeleted := make(map[string]struct{})

	grp, grpCtx := errgroup.WithContext(ctx)
	grp.Go(func() error {
		res, err := srClient.Subjects(grpCtx)
		if err != nil {
			return err
		}
		for _, subject := range res {
			subjects[subject] = struct{}{}
		}
		return nil
	})
	grp.Go(func() error {
		res, err := srClient.Subjects(sr.WithParams(grpCtx, sr.ShowDeleted))
		if err != nil {
			return err
		}
		for _, subject := range res {
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
	slices.SortFunc(result, func(a, b SchemaRegistrySubject) int {
		return strings.Compare(a.Name, b.Name)
	})

	return result, nil
}

// SchemaRegistrySubjectDetails represents a schema registry subject along
// with other information such as the registered versions that belong to it,
// or the full schema information that's part of the subject.
type SchemaRegistrySubjectDetails struct {
	Name                string                                `json:"name"`
	Type                sr.SchemaType                         `json:"type"`
	Compatibility       string                                `json:"compatibility"`
	RegisteredVersions  []SchemaRegistrySubjectDetailsVersion `json:"versions"`
	LatestActiveVersion int                                   `json:"latestActiveVersion"`
	Schemas             []SchemaRegistryVersionedSchema       `json:"schemas"`
}

const (
	// SchemaVersionsAll can be specified as version to retrieve all schema versions.
	SchemaVersionsAll string = "all"
	// SchemaVersionsLatest can be specified as version to retrieve the latest active schema.
	SchemaVersionsLatest string = "latest"
)

func mapSubjectSchema(in sr.SubjectSchema, isSoftDeleted bool) SchemaRegistryVersionedSchema {
	references := make([]Reference, len(in.References))
	for i, ref := range in.References {
		references[i] = Reference{
			Name:    ref.Name,
			Subject: ref.Subject,
			Version: ref.Version,
		}
	}
	return SchemaRegistryVersionedSchema{
		ID:            in.ID,
		Version:       in.Version,
		IsSoftDeleted: isSoftDeleted,
		Type:          in.Type,
		Schema:        in.Schema.Schema,
		References:    references,
	}
}

// GetSchemaRegistrySubjectDetails retrieves the schema details for the given subject, version tuple.
// Use version = 'latest' to retrieve the latest schema.
// Use version = 'all' to retrieve all schemas for this subject.
// Use version = 3 to retrieve the specific version for the given subject
func (s *Service) GetSchemaRegistrySubjectDetails(ctx context.Context, subjectName, version string) (*SchemaRegistrySubjectDetails, error) {
	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		return nil, err
	}

	// 1. Retrieve all schema versions registered for the given subject
	versions, err := s.getSchemaRegistrySchemaVersions(ctx, srClient, subjectName)
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
	var compatLevel string

	grp, grpCtx := errgroup.WithContext(ctx)
	grp.SetLimit(10)

	grp.Go(func() error {
		compatLevel = s.getSubjectCompatibilityLevel(grpCtx, srClient, subjectName)
		return nil
	})

	// 3. Request all schema versions for the given subject
	schemas := make([]SchemaRegistryVersionedSchema, 0, len(versions))

	switch version {
	case SchemaVersionsAll:
		grp.Go(func() error {
			subjectSchemas, err := srClient.Schemas(sr.WithParams(ctx, sr.ShowDeleted), subjectName)
			if err != nil {
				return fmt.Errorf("failed to retrieve all sch versions for subject %q: %w", subjectName, err)
			}
			for _, sch := range subjectSchemas {
				schemas = append(schemas, mapSubjectSchema(sch, softDeletedVersions[sch.Version]))
			}
			return nil
		})
	case SchemaVersionsLatest:
		version = "-1"
		fallthrough
	default:
		grp.Go(func() error {
			versionInt, err := strconv.Atoi(version)
			if err != nil {
				return fmt.Errorf("failed to parse version %q: %w", version, err)
			}
			subjectSchema, err := srClient.SchemaByVersion(sr.WithParams(ctx, sr.ShowDeleted), subjectName, versionInt)
			if err != nil {
				return fmt.Errorf("failed to retrieve schema by version %q: %w", subjectName, err)
			}
			schemas = append(schemas, mapSubjectSchema(subjectSchema, softDeletedVersions[subjectSchema.Version]))
			return nil
		})
	}

	if err := grp.Wait(); err != nil {
		return nil, err
	}

	var schemaType sr.SchemaType
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
func (*Service) getSchemaRegistrySchemaVersions(ctx context.Context, srClient *rpsr.Client, subjectName string) ([]SchemaRegistrySubjectDetailsVersion, error) {
	type chResponse struct {
		Res             []int
		WithSoftDeleted bool
	}
	ch := make(chan chResponse, 2)

	g, grpCtx := errgroup.WithContext(ctx)

	// 1. Get versions without soft-deleted
	g.Go(func() error {
		versions, err := srClient.SubjectVersions(grpCtx, subjectName)
		if err != nil {
			var schemaError *sr.ResponseError
			if errors.As(err, &schemaError) && schemaError.ErrorCode == 40401 {
				// It's expected to get an error here if the targeted subject
				// is soft-deleted (Subject not found / errcode 40401).
				return nil
			}
			return fmt.Errorf("failed to retrieve subject versions (without soft-deleted): %w", err)
		}
		ch <- chResponse{
			Res:             versions,
			WithSoftDeleted: false,
		}
		return nil
	})

	// 2. Get versions with soft-deleted
	g.Go(func() error {
		versions, err := srClient.SubjectVersions(sr.WithParams(grpCtx, sr.ShowDeleted), subjectName)
		if err != nil {
			return fmt.Errorf("failed to retrieve subject versions (with soft-deleted): %w", err)
		}

		ch <- chResponse{
			Res:             versions,
			WithSoftDeleted: true,
		}
		return nil
	})

	err := g.Wait()
	if err != nil {
		return nil, err
	}
	close(ch)

	activeVersions := make(map[int]struct{})
	versionsWithSoftDeleted := make(map[int]struct{})
	for res := range ch {
		if res.WithSoftDeleted {
			for _, v := range res.Res {
				versionsWithSoftDeleted[v] = struct{}{}
			}
		} else {
			for _, v := range res.Res {
				activeVersions[v] = struct{}{}
			}
		}
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
	slices.SortFunc(response, func(a, b SchemaRegistrySubjectDetailsVersion) int {
		return a.Version - b.Version
	})

	return response, nil
}

// getSubjectCompatibilityLevel retrieves the compatibility level for a subject,
// handling the case where no specific compatibility is configured.
func (s *Service) getSubjectCompatibilityLevel(ctx context.Context, srClient *rpsr.Client, subjectName string) string {
	compatibilityRes := srClient.Compatibility(ctx, subjectName)
	compatibility := compatibilityRes[0]
	if err := compatibility.Err; err != nil {
		var schemaErr *sr.ResponseError
		if errors.As(err, &schemaErr) && schemaErr.ErrorCode == 40408 {
			// Subject compatibility not configured, this means the default compatibility will be used
			return "DEFAULT"
		}
		// For other errors, log warning and return UNKNOWN
		s.logger.WarnContext(ctx, "failed to get subject config", slog.String("subject", subjectName), slog.Any("error", err))
		return "UNKNOWN"
	}
	return compatibility.Level.String()
}

// SchemaRegistryVersionedSchema describes a retrieved schema.
type SchemaRegistryVersionedSchema struct {
	ID            int           `json:"id"`
	Version       int           `json:"version"`
	IsSoftDeleted bool          `json:"isSoftDeleted"`
	Type          sr.SchemaType `json:"type"`
	Schema        string        `json:"schema"`
	References    []Reference   `json:"references"`
}

// Reference describes a reference to a different schema stored in the schema registry.
type Reference struct {
	Name    string `json:"name"`
	Subject string `json:"subject"`
	Version int    `json:"version"`
}

// GetSchemaRegistrySchema retrieves a schema for a given subject, version tuple from the
// schema registry. You can use -1 as the version to return the latest schema,
func (s *Service) GetSchemaRegistrySchema(ctx context.Context, subjectName string, version int, showSoftDeleted bool) (*SchemaRegistryVersionedSchema, error) {
	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		return nil, err
	}

	if showSoftDeleted {
		ctx = sr.WithParams(ctx, sr.ShowDeleted)
	}
	sch, err := srClient.SchemaByVersion(ctx, subjectName, version)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve schema by version %q: %w", version, err)
	}

	// Always assuming soft-deleted=false is wrong here! This should be fixed,
	// but won't be changed as part of this refactoring.
	mappedSchema := mapSubjectSchema(sch, false)

	return &mappedSchema, nil
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
// subject-version. You can use -1 as the version to check the latest version.
func (s *Service) GetSchemaRegistrySchemaReferencedBy(ctx context.Context, subjectName string, version int) ([]SchemaReference, error) {
	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		return nil, err
	}

	schemaRefs, err := srClient.SchemaReferences(sr.WithParams(ctx, sr.ShowDeleted), subjectName, version)
	if err != nil {
		return nil, err
	}

	ch := make(chan SchemaReference, len(schemaRefs))
	grp, grpCtx := errgroup.WithContext(ctx)
	grp.SetLimit(10)
	for _, subjectSchema := range schemaRefs {
		schemaIDCpy := subjectSchema.ID
		grp.Go(func() error {
			subjectVersions, err := srClient.SchemaUsagesByID(sr.WithParams(grpCtx, sr.ShowDeleted), schemaIDCpy)
			if err != nil {
				ch <- SchemaReference{
					Error: err.Error(),
				}
				return nil //nolint:nilerr // we communicate error via channel
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

	response := make([]SchemaReference, 0, len(schemaRefs))
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
	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		return nil, err
	}

	deletedVersions, err := srClient.DeleteSubject(ctx, subjectName, sr.DeleteHow(deletePermanently))
	if err != nil {
		return nil, err
	}

	return &SchemaRegistryDeleteSubjectResponse{DeletedVersions: deletedVersions}, nil
}

// SchemaRegistryDeleteSubjectVersionResponse is the response to deleting a subject version.
type SchemaRegistryDeleteSubjectVersionResponse struct {
	DeletedVersion int `json:"deletedVersion"`
}

// DeleteSchemaRegistrySubjectVersion deletes a schema registry subject version.
func (s *Service) DeleteSchemaRegistrySubjectVersion(ctx context.Context, subjectName string, version int, deletePermanently bool) (*SchemaRegistryDeleteSubjectVersionResponse, error) {
	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		return nil, err
	}

	err = srClient.DeleteSchema(ctx, subjectName, version, sr.DeleteHow(deletePermanently))
	if err != nil {
		return nil, err
	}

	return &SchemaRegistryDeleteSubjectVersionResponse{DeletedVersion: version}, nil
}

// SchemaRegistrySchemaTypes describe the schema types that are supported by the schema registry.
type SchemaRegistrySchemaTypes struct {
	SchemaTypes []sr.SchemaType `json:"schemaTypes"`
}

// GetSchemaRegistrySchemaTypes returns the supported schema types.
func (s *Service) GetSchemaRegistrySchemaTypes(ctx context.Context) (*SchemaRegistrySchemaTypes, error) {
	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		return nil, err
	}

	res, err := srClient.SupportedTypes(ctx)
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
func (s *Service) CreateSchemaRegistrySchema(ctx context.Context, subjectName string, schema sr.Schema) (*CreateSchemaResponse, error) {
	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		return nil, err
	}

	subjectSchema, err := srClient.CreateSchema(ctx, subjectName, schema)
	if err != nil {
		return nil, err
	}

	return &CreateSchemaResponse{ID: subjectSchema.ID}, nil
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
	version int,
	sch sr.Schema,
) (*SchemaRegistrySchemaValidation, error) {
	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		return nil, err
	}

	// Compatibility check from schema registry
	var compatErr string
	var isCompatible bool
	compatRes, err := srClient.CheckCompatibility(ctx, subjectName, version, sch)
	if err != nil {
		compatErr = err.Error()

		// If subject doesn't exist, we will reset the error, because new subject schemas
		// don't have any existing schema and therefore can't be incompatible.
		var schemaErr *sr.ResponseError
		if errors.As(err, &schemaErr) {
			if schemaErr.ErrorCode == 40401 { // Subject not found error code
				compatErr = ""
				isCompatible = true
			}
		}
	} else {
		isCompatible = compatRes.Is
	}

	var parsingErr string
	switch sch.Type {
	case sr.TypeAvro:
		if _, err := s.cachedSchemaClient.ParseAvroSchemaWithReferences(ctx, sch); err != nil {
			parsingErr = err.Error()
		}
	case sr.TypeJSON:
		if _, err := s.cachedSchemaClient.ParseJSONSchema(ctx, sch); err != nil {
			parsingErr = err.Error()
		}
	case sr.TypeProtobuf:
		if _, err := s.cachedSchemaClient.CompileProtoSchemaWithReferences(ctx, sch, make(map[string]string)); err != nil {
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
	}, nil
}

// SchemaVersion is the response to requesting schema usages by a global schema id.
type SchemaVersion struct {
	Subject string `json:"subject"`
	Version int    `json:"version"`
}

// GetSchemaUsagesByID registers a new schema for the given subject in the schema registry.
func (s *Service) GetSchemaUsagesByID(ctx context.Context, schemaID int) ([]SchemaVersion, error) {
	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		return nil, err
	}

	res, err := srClient.SchemaUsagesByID(ctx, schemaID)
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

// ListSRACLs lists Schema Registry ACLs based on the provided filter
func (s *Service) ListSRACLs(ctx context.Context, filter []rpsr.ACL) ([]rpsr.ACL, error) {
	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		return nil, err
	}
	return srClient.ListACLsBatch(ctx, filter)
}
