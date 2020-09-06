package owl

import (
	"context"
	"encoding/json"
	"fmt"
)

type SchemaDetails struct {
	Subject            string      `json:"string"`
	SchemaID           int         `json:"schemaId"`
	Version            int         `json:"version"`
	Schema             interface{} `json:"schema"`
	RegisteredVersions []int       `json:"registeredVersions"`
}

func (s *Service) GetSchemaDetails(_ context.Context, subject string, version string) (*SchemaDetails, error) {
	if s.kafkaSvc.SchemaService == nil {
		return nil, ErrSchemaRegistryNotConfigured
	}

	versions, err := s.kafkaSvc.SchemaService.GetSubjectVersions(subject)
	if err != nil {
		return nil, fmt.Errorf("failed to get versions for given subject: %w", err)
	}

	versionedSchema, err := s.kafkaSvc.SchemaService.GetSchemaBySubject(subject, version)
	if err != nil {
		return nil, fmt.Errorf("failed to get versioned schema for given subject: %w", err)
	}

	var parsedSchema interface{}
	err = json.Unmarshal([]byte(versionedSchema.Schema), &parsedSchema)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal schema to JSON object: %w", err)
	}

	return &SchemaDetails{
		Subject:            subject,
		SchemaID:           versionedSchema.SchemaID,
		Version:            versionedSchema.Version,
		RegisteredVersions: versions.Versions,
		Schema:             parsedSchema,
	}, nil
}
