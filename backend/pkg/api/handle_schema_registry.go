// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"

	"github.com/cloudhut/common/rest"
	"github.com/go-chi/chi/v5"

	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/schema"
)

func (api *API) handleSchemaRegistryNotConfigured() http.HandlerFunc {
	type response struct {
		IsConfigured bool `json:"isConfigured"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		rest.SendResponse(w, r, api.Logger, http.StatusOK, &response{IsConfigured: false})
	}
}

func (api *API) handleGetSchemaRegistryMode() http.HandlerFunc {
	if !api.Cfg.Kafka.Schema.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		res, err := api.ConsoleSvc.GetSchemaRegistryMode(r.Context())
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusBadGateway,
				Message:  fmt.Sprintf("Failed to retrieve schema registry mode from the schema registry: %v", err.Error()),
				IsSilent: false,
			})
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleGetSchemaRegistryConfig() http.HandlerFunc {
	if !api.Cfg.Kafka.Schema.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		res, err := api.ConsoleSvc.GetSchemaRegistryConfig(r.Context())
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusBadGateway,
				Message:  fmt.Sprintf("Failed to retrieve schema registry config from the schema registry: %v", err.Error()),
				IsSilent: false,
			})
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleGetSchemaSubjects() http.HandlerFunc {
	if !api.Cfg.Kafka.Schema.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		res, err := api.ConsoleSvc.GetSchemaRegistrySubjects(r.Context())
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusBadGateway,
				Message:  fmt.Sprintf("Failed to retrieve subjects from the schema registry: %v", err.Error()),
				IsSilent: false,
			})
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleGetSchemaSubjectDetails() http.HandlerFunc {
	if !api.Cfg.Kafka.Schema.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse subject name parameter and unescape
		subjectNameStr := chi.URLParam(r, "subject")
		subjectName, err := url.PathUnescape(subjectNameStr)
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("failed to unescape subject name %q: %w", subjectNameStr, err),
				Status:   http.StatusBadRequest,
				Message:  fmt.Sprintf("Failed to unescape subject name %q: %v", subjectNameStr, err.Error()),
				IsSilent: false,
			})
			return
		}

		// 2. Parse and validate version input
		version := chi.URLParam(r, "version")
		switch version {
		case console.SchemaVersionsAll, console.SchemaVersionsLatest:
			break
		default:
			// Must be number or it's invalid input
			_, err := strconv.Atoi(version)
			if err != nil {
				descriptiveErr := fmt.Errorf("version %q is not valid. Must be %q, %q or a positive integer", version, console.SchemaVersionsLatest, console.SchemaVersionsAll)
				rest.SendRESTError(w, r, api.Logger, &rest.Error{
					Err:      descriptiveErr,
					Status:   http.StatusBadRequest,
					Message:  descriptiveErr.Error(),
					IsSilent: false,
				})
				return
			}
		}

		// 3. Get all subjects' details
		res, err := api.ConsoleSvc.GetSchemaRegistrySubjectDetails(r.Context(), subjectName, version)
		if err != nil {
			var schemaError *schema.RestError
			if errors.As(err, &schemaError) && schemaError.ErrorCode == 40401 {
				rest.SendRESTError(w, r, api.Logger, &rest.Error{
					Err:      err,
					Status:   http.StatusNotFound,
					Message:  fmt.Sprintf("Requested subject does not exist"),
					IsSilent: false,
				})
				return
			}

			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusBadGateway,
				Message:  fmt.Sprintf("Failed to retrieve subjects from the schema registry: %v", err.Error()),
				IsSilent: false,
			})
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}
