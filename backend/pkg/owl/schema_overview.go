// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package owl

import (
	"context"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/schema"
	"golang.org/x/sync/errgroup"
	"time"
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

type SchemaSubject struct {
	Name          string `json:"name"`
	Compatibility string `json:"compatibilityLevel"`
	VersionsCount int    `json:"versionsCount"`
	LatestVersion string `json:"latestVersion"`
	RequestError  string `json:"requestError"`
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
			ch <- chResponse{
				Mode: mode,
				Error: &SchemaOverviewRequestError{
					RequestDescription: "schema registry mode",
					ErrorMessage:       fmt.Sprintf("failed to get schema registry mode: %s", err.Error()),
				},
			}
			return nil
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
		res, err := s.kafkaSvc.SchemaService.GetSubjects()
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
