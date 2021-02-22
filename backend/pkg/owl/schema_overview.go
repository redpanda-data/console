package owl

import (
	"context"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/schema"
	"golang.org/x/sync/errgroup"
	"strconv"
	"sync"
	"time"
)

// SchemaOverview contains high level information about the registered subjects in the schema registry.
type SchemaOverview struct {
	Mode          string                       `json:"mode"`
	Compatibility string                       `json:"compatibilityLevel"`
	Subjects      []SchemaSubject              `json:"subjects"`
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
		Subjects []SchemaSubject
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
		}
		ch <- chResponse{Config: config}
		return nil
	})

	g.Go(func() error {
		res, err := s.kafkaSvc.SchemaService.GetSubjects()
		if err != nil {
			return fmt.Errorf("failed to get subjects: %w", err)
		}

		subjects := s.getSchemaSubjects(res.Subjects)

		ch <- chResponse{Subjects: subjects}
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
		Subjects:      make([]SchemaSubject, 0),
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

// getSchemaSubjects fetches the latest version and the compatibility level for each subject from the schema registry.
// Requests are issued concurrently.
func (s *Service) getSchemaSubjects(subjects []string) []SchemaSubject {
	response := make([]SchemaSubject, len(subjects))
	for i, subject := range subjects {
		res := SchemaSubject{
			Name:          subject,
			Compatibility: "",
			VersionsCount: -1,
			LatestVersion: "",
			RequestError:  "",
		}
		mutex := sync.Mutex{}

		wg := sync.WaitGroup{}
		wg.Add(1)
		go func(subject string) {
			defer wg.Done()

			cfgRes, err := s.kafkaSvc.SchemaService.GetSubjectConfig(subject)
			mutex.Lock()
			defer mutex.Unlock()

			if err != nil {
				res.RequestError = fmt.Sprintf("failed to request config: %s", err.Error())
			}
			res.Compatibility = cfgRes.Compatibility
		}(subject)

		wg.Add(1)
		go func(subject string) {
			defer wg.Done()
			subRes, err := s.kafkaSvc.SchemaService.GetSubjectVersions(subject)
			mutex.Lock()
			defer mutex.Unlock()

			if err != nil {
				res.RequestError = fmt.Sprintf("failed to request subject versions: %s", err.Error())
				return
			}

			if len(subRes.Versions) == 0 {
				res.RequestError = "returned subject versions array was empty"
				return
			}

			versionsCount := len(subRes.Versions)
			res.VersionsCount = versionsCount

			latestVersion := subRes.Versions[len(subRes.Versions)-1]
			res.LatestVersion = strconv.Itoa(latestVersion)
		}(subject)
		wg.Wait()

		response[i] = res
	}

	return response
}
