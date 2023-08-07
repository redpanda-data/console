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
	"fmt"
	"time"

	"golang.org/x/exp/slices"
	"golang.org/x/sync/errgroup"

	"github.com/redpanda-data/console/backend/pkg/schema"
)

// SchemaOverview contains high level information about the registered subjects in the schema registry.
type SchemaOverview struct {
	Mode          string                       `json:"mode"`
	Compatibility string                       `json:"compatibilityLevel"`
	Subjects      []string                     `json:"subjects"`
	RequestErrors []SchemaOverviewRequestError `json:"requestErrors"`
}

// SchemaOverviewRequestError represents a failed request towards the schema registry. Due to different versions of
// supported schema registries specific requests may not be supported. If that's the case we don't want the whole
// request to fail, but we still want to let the frontend know that some requests have failed.
type SchemaOverviewRequestError struct {
	RequestDescription string `json:"requestDescription"`
	ErrorMessage       string `json:"errorMessage"`
}

// SchemaSubject is the metadata information for a schema registered in the Schema registry.
type SchemaSubject struct {
	Name          string `json:"name"`
	Compatibility string `json:"compatibilityLevel"`
	VersionsCount int    `json:"versionsCount"`
	LatestVersion string `json:"latestVersion"`
	RequestError  string `json:"requestError"`
}

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

// GetSchemaOverview returns a list of all registered subjects in the schema registry.
func (s *Service) GetSchemaOverview(ctx context.Context) (*SchemaOverview, error) {
	if s.kafkaSvc.SchemaService == nil {
		return nil, ErrSchemaRegistryNotConfigured
	}

	// 1. Get a list of all registered subjects, global config and the registry mode in parallel
	type chResponse struct {
		Mode     *schema.ModeResponse
		Config   *schema.ConfigResponse
		Subjects []string
		Error    *SchemaOverviewRequestError
	}
	ch := make(chan chResponse, 3)

	// TODO: Remove once global timeouts as middleware are active
	errGroupCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	g, _ := errgroup.WithContext(errGroupCtx)

	g.Go(func() error {
		mode, err := s.kafkaSvc.SchemaService.GetMode()
		if err != nil {
			// Some schema registry implementations do not support this endpoint. In order to not render an
			// error notification we will report a mode without an error message.
			mode = &schema.ModeResponse{Mode: "unknown"}
		}
		ch <- chResponse{Mode: mode}
		return nil
	})

	g.Go(func() error {
		config, err := s.kafkaSvc.SchemaService.GetConfig()
		if err != nil {
			ch <- chResponse{
				Error: &SchemaOverviewRequestError{
					RequestDescription: "schema registry config",
					ErrorMessage:       fmt.Sprintf("failed to get schema registry config: %s", err.Error()),
				},
			}
			return nil
		}
		ch <- chResponse{Config: config}
		return nil
	})

	g.Go(func() error {
		res, err := s.kafkaSvc.SchemaService.GetSubjects(false)
		if err != nil {
			return fmt.Errorf("failed to get subjects: %w", err)
		}

		ch <- chResponse{Subjects: res.Subjects}
		return nil
	})

	// Return early if subjects request has failed
	err := g.Wait()
	close(ch)
	if err != nil {
		return nil, err
	}

	res := &SchemaOverview{
		Mode:          "",
		Compatibility: "",
		Subjects:      make([]string, 0),
		RequestErrors: make([]SchemaOverviewRequestError, 0),
	}
	for result := range ch {
		if result.Error != nil {
			res.RequestErrors = append(res.RequestErrors, *result.Error)
			continue
		}
		if result.Mode != nil {
			res.Mode = result.Mode.Mode
		}
		if result.Config != nil {
			res.Compatibility = result.Config.Compatibility
		}
		if result.Subjects != nil {
			res.Subjects = result.Subjects
		}
	}

	return res, nil
}
