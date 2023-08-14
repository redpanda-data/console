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
	"strconv"

	"github.com/cloudhut/common/rest"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

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
		// 1. Parse request params
		subjectName := rest.GetURLParam(r, "subject")

		// 2. Parse and validate version input
		version := rest.GetURLParam(r, "version")
		switch version {
		case console.SchemaVersionsAll, console.SchemaVersionsLatest:
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
					Message:  "Requested subject does not exist",
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

func (api *API) handleDeleteSubject() http.HandlerFunc {
	if !api.Cfg.Kafka.Schema.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse request parameters
		subjectName := rest.GetURLParam(r, "subject")

		deletePermanentlyStr := rest.GetQueryParam(r, "permanent")
		if deletePermanentlyStr == "" {
			deletePermanentlyStr = "false"
		}
		deletePermanently, err := strconv.ParseBool(deletePermanentlyStr)
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("failed to parse deletePermanently query param %q: %w", deletePermanentlyStr, err),
				Status:   http.StatusBadRequest,
				Message:  fmt.Sprintf("Failed to parse 'permanent' query param with value %q: %v", deletePermanentlyStr, err.Error()),
				IsSilent: false,
			})
			return
		}

		// 2. Send delete request
		res, err := api.ConsoleSvc.DeleteSchemaRegistrySubject(r.Context(), subjectName, deletePermanently)
		if err != nil {
			var schemaError *schema.RestError
			if errors.As(err, &schemaError) && schemaError.ErrorCode == 40401 {
				rest.SendRESTError(w, r, api.Logger, &rest.Error{
					Err:      err,
					Status:   http.StatusNotFound,
					Message:  "Requested subject does not exist",
					IsSilent: false,
				})
				return
			}

			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          err,
				Status:       http.StatusServiceUnavailable,
				Message:      fmt.Sprintf("Failed to delete schema registry subject: %v", err.Error()),
				InternalLogs: []zapcore.Field{zap.String("subject_name", subjectName)},
				IsSilent:     false,
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}
