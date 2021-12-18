package owl

import (
	"context"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/schema"

	"go.uber.org/zap"
)

type SchemaDetails struct {
	Subject            string `json:"string"`
	SchemaID           int    `json:"schemaId"`
	Version            int    `json:"version"`
	Compatibility      string `json:"compatibility"`
	Schema             string `json:"schema"`
	RegisteredVersions []int  `json:"registeredVersions"`
	Type               string `json:"type"`
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

	cfgRes, err := s.kafkaSvc.SchemaService.GetSubjectConfig(subject)
	if err != nil {
		s.logger.Debug("failed to get compatibility for given subject", zap.Error(err))
		cfgRes, err = s.kafkaSvc.SchemaService.GetConfig()
		if err != nil {
			s.logger.Warn("failed to get subject and global compatibility for given subject",
				zap.String("subject", subject),
				zap.Error(err))
			cfgRes = &schema.ConfigResponse{Compatibility: "UNKNOWN"}
		}
	}

	return &SchemaDetails{
		Subject:            subject,
		SchemaID:           versionedSchema.SchemaID,
		Version:            versionedSchema.Version,
		Compatibility:      cfgRes.Compatibility,
		RegisteredVersions: versions.Versions,
		Schema:             versionedSchema.Schema,
		Type:               versionedSchema.Type,
	}, nil
}
