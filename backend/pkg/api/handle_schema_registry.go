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
	"strings"

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
		canView, restErr := api.Hooks.Authorization.CanViewSchemas(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canView {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to get schema registry mode"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to get the schema registry mode.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

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

func (api *API) handleGetSchemaRegistrySchemaTypes() http.HandlerFunc {
	if !api.Cfg.Kafka.Schema.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		canView, restErr := api.Hooks.Authorization.CanViewSchemas(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canView {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to get schema registry types"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to get the schema registry types.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		res, err := api.ConsoleSvc.GetSchemaRegistrySchemaTypes(r.Context())
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusBadGateway,
				Message:  fmt.Sprintf("Failed to retrieve schema registry types from the schema registry: %v", err.Error()),
				IsSilent: false,
			})
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleGetSchemaUsagesByID() http.HandlerFunc {
	if !api.Cfg.Kafka.Schema.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		canView, restErr := api.Hooks.Authorization.CanViewSchemas(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canView {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to get schema usages by id"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to get the schema usages by id.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 1. Parse and validate version input
		schemaIDStr := rest.GetURLParam(r, "id")
		schemaID, err := strconv.Atoi(schemaIDStr)
		if err != nil {
			descriptiveErr := fmt.Errorf("schema id %q is not valid. Must be a positive integer", schemaID)
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      descriptiveErr,
				Status:   http.StatusBadRequest,
				Message:  descriptiveErr.Error(),
				IsSilent: false,
			})
			return
		}

		res, err := api.ConsoleSvc.GetSchemaUsagesByID(r.Context(), schemaID)
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusBadGateway,
				Message:  fmt.Sprintf("Failed to retrieve schema usages for schema id: %v", err.Error()),
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
		canView, restErr := api.Hooks.Authorization.CanViewSchemas(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canView {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to get schema registry config"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to get the schema registry config.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		res, err := api.ConsoleSvc.GetSchemaRegistryConfig(r.Context())
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusBadGateway,
				Message:  fmt.Sprintf("Failed to retrieve schema registry types from the schema registry: %v", err.Error()),
				IsSilent: false,
			})
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handlePutSchemaRegistryConfig() http.HandlerFunc {
	if !api.Cfg.Kafka.Schema.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	type request struct {
		Compatibility schema.CompatibilityLevel `json:"compatibility"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		canManage, restErr := api.Hooks.Authorization.CanManageSchemaRegistry(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canManage {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to change the schema registry config"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to change the schema registry config.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		req := request{}
		restErr = rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		res, err := api.ConsoleSvc.PutSchemaRegistryConfig(r.Context(), req.Compatibility)
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusBadGateway,
				Message:  fmt.Sprintf("Failed to set global compatibility level: %v", err.Error()),
				IsSilent: false,
			})
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handlePutSchemaRegistrySubjectConfig() http.HandlerFunc {
	if !api.Cfg.Kafka.Schema.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	type request struct {
		Compatibility schema.CompatibilityLevel `json:"compatibility"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		canManage, restErr := api.Hooks.Authorization.CanManageSchemaRegistry(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canManage {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to change the subject config"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to change the subject config.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 1. Parse request parameters
		subjectName := getSubjectFromRequestPath(r)

		req := request{}
		restErr = rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 2. Set subject compatibility level
		res, err := api.ConsoleSvc.PutSchemaRegistrySubjectConfig(r.Context(), subjectName, req.Compatibility)
		if err != nil {
			var schemaError *schema.RestError
			if errors.As(err, &schemaError) && schemaError.ErrorCode == schema.CodeSubjectNotFound {
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
				Message:  fmt.Sprintf("Failed to set subject's compatibility level: %v", err.Error()),
				IsSilent: false,
			})
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleDeleteSchemaRegistrySubjectConfig() http.HandlerFunc {
	if !api.Cfg.Kafka.Schema.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		canManage, restErr := api.Hooks.Authorization.CanManageSchemaRegistry(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canManage {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to change the subject config"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to change the subject config.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 1. Parse request parameters
		subjectName := getSubjectFromRequestPath(r)

		// 2. Set subject compatibility level
		res, err := api.ConsoleSvc.DeleteSchemaRegistrySubjectConfig(r.Context(), subjectName)
		if err != nil {
			var schemaError *schema.RestError
			if errors.As(err, &schemaError) && schemaError.ErrorCode == schema.CodeSubjectNotFound {
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
				Message:  fmt.Sprintf("Failed to delete subject's compatibility level: %v", err.Error()),
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
		canView, restErr := api.Hooks.Authorization.CanViewSchemas(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canView {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to get schema subjects"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to get the schema subjects.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

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
		canView, restErr := api.Hooks.Authorization.CanViewSchemas(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canView {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to get subject details"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to get subject details.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 1. Parse request params
		subjectName := getSubjectFromRequestPath(r)

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
			if errors.As(err, &schemaError) && schemaError.ErrorCode == schema.CodeSubjectNotFound {
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

func (api *API) handleGetSchemaReferencedBy() http.HandlerFunc {
	if !api.Cfg.Kafka.Schema.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		canView, restErr := api.Hooks.Authorization.CanViewSchemas(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canView {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to get schema references"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to get schema references.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 1. Parse request params
		subjectName := getSubjectFromRequestPath(r)

		// 2. Parse and validate version input
		version := rest.GetURLParam(r, "version")
		switch version {
		case console.SchemaVersionsLatest:
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
		res, err := api.ConsoleSvc.GetSchemaRegistrySchemaReferencedBy(r.Context(), subjectName, version)
		if err != nil {
			var schemaError *schema.RestError
			if errors.As(err, &schemaError) && schemaError.ErrorCode == schema.CodeSubjectNotFound {
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
				Message:  fmt.Sprintf("Failed to retrieve schema references from the schema registry: %v", err.Error()),
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
		canDelete, restErr := api.Hooks.Authorization.CanDeleteSchemas(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canDelete {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to delete a subject"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to delete a subject.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 1. Parse request parameters
		subjectName := getSubjectFromRequestPath(r)

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
			if errors.As(err, &schemaError) && schemaError.ErrorCode == schema.CodeSubjectNotFound {
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

func (api *API) handleDeleteSubjectVersion() http.HandlerFunc {
	if !api.Cfg.Kafka.Schema.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		canDelete, restErr := api.Hooks.Authorization.CanDeleteSchemas(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canDelete {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to delete a subject version"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to delete a subject version.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 1. Parse request parameters
		subjectName := getSubjectFromRequestPath(r)

		version := rest.GetURLParam(r, "version")
		switch version {
		case console.SchemaVersionsLatest:
		default:
			// Must be number or it's invalid input
			_, err := strconv.Atoi(version)
			if err != nil {
				descriptiveErr := fmt.Errorf("version %q is not valid. Must be %q or a positive integer", version, console.SchemaVersionsLatest)
				rest.SendRESTError(w, r, api.Logger, &rest.Error{
					Err:      descriptiveErr,
					Status:   http.StatusBadRequest,
					Message:  descriptiveErr.Error(),
					IsSilent: false,
				})
				return
			}
		}

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
		res, err := api.ConsoleSvc.DeleteSchemaRegistrySubjectVersion(r.Context(), subjectName, version, deletePermanently)
		if err != nil {
			var schemaError *schema.RestError
			if errors.As(err, &schemaError) && schemaError.ErrorCode == schema.CodeSubjectNotFound {
				rest.SendRESTError(w, r, api.Logger, &rest.Error{
					Err:      err,
					Status:   http.StatusNotFound,
					Message:  "Requested subject does not exist",
					IsSilent: false,
				})
				return
			}
			if errors.As(err, &schemaError) && schemaError.ErrorCode == schema.CodeVersionNotFound {
				rest.SendRESTError(w, r, api.Logger, &rest.Error{
					Err:      err,
					Status:   http.StatusNotFound,
					Message:  "Requested version does not exist on the given subject",
					IsSilent: false,
				})
				return
			}

			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:     err,
				Status:  http.StatusServiceUnavailable,
				Message: fmt.Sprintf("Failed to delete schema registry subject version: %v", err.Error()),
				InternalLogs: []zapcore.Field{
					zap.String("subject_name", subjectName),
					zap.String("version", version),
				},
				IsSilent: false,
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleCreateSchema() http.HandlerFunc {
	if !api.Cfg.Kafka.Schema.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		canCreate, restErr := api.Hooks.Authorization.CanCreateSchemas(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canCreate {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to create a new schema"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to create a new schema.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 1. Parse request parameters
		subjectName := getSubjectFromRequestPath(r)

		var payload schema.Schema
		restErr = rest.Decode(w, r, &payload)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if payload.Schema == "" {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("payload validation failed for creating schema"),
				Status:       http.StatusBadRequest,
				Message:      "You must set the schema field when creating a new schema",
				InternalLogs: []zapcore.Field{zap.String("subject_name", subjectName)},
				IsSilent:     false,
			})
			return
		}

		// 2. Send create request
		res, err := api.ConsoleSvc.CreateSchemaRegistrySchema(r.Context(), subjectName, payload)
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          err,
				Status:       http.StatusServiceUnavailable,
				Message:      fmt.Sprintf("Failed to create schema: %v", err.Error()),
				InternalLogs: []zapcore.Field{zap.String("subject_name", subjectName)},
				IsSilent:     false,
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleValidateSchema() http.HandlerFunc {
	if !api.Cfg.Kafka.Schema.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		canView, restErr := api.Hooks.Authorization.CanViewSchemas(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canView {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to validate schema"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to validate schema.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 1. Parse request parameters
		subjectName := getSubjectFromRequestPath(r)

		version := rest.GetURLParam(r, "version")
		switch version {
		case console.SchemaVersionsLatest:
		default:
			// Must be number or it's invalid input
			_, err := strconv.Atoi(version)
			if err != nil {
				descriptiveErr := fmt.Errorf("version %q is not valid. Must be %q or a positive integer", version, console.SchemaVersionsLatest)
				rest.SendRESTError(w, r, api.Logger, &rest.Error{
					Err:      descriptiveErr,
					Status:   http.StatusBadRequest,
					Message:  descriptiveErr.Error(),
					IsSilent: false,
				})
				return
			}
		}

		var payload schema.Schema
		restErr = rest.Decode(w, r, &payload)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if payload.Schema == "" {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("payload validation failed for validating schema"),
				Status:       http.StatusBadRequest,
				Message:      "You must set the schema field when validating the schema",
				InternalLogs: []zapcore.Field{zap.String("subject_name", subjectName)},
				IsSilent:     false,
			})
			return
		}

		// 2. Send validate request
		res := api.ConsoleSvc.ValidateSchemaRegistrySchema(r.Context(), subjectName, version, payload)
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func getSubjectFromRequestPath(r *http.Request) string {
	// subject extraction gets complicated
	// With a path like /api/schema-registry/subjects/%252F/versions/latest
	// r.URL.Path is /api/schemas/schema-registry/%2F/versions/latest
	// while RequestURI is /api/schemas/schema-registry/%252F/versions/latest
	// that means that chi.URLParam() returns  %2F
	// which then url.PathUnescape() within rest.GetURLParam() returns "/"
	// which is "double escaped"
	// so we have to manually extract and escape the subject part ourselves

	requestURI := r.RequestURI
	// remove the api route prefix
	requestURI = strings.ReplaceAll(requestURI, "/api/schema-registry/subjects/", "")
	requestURI = strings.ReplaceAll(requestURI, "/api/schema-registry/config/", "")
	// find the versions suffix of the path
	subjectPart := requestURI
	lastIndex := strings.Index(requestURI, "/")
	if lastIndex > 0 { // satisfy linter
		// and extract the subject at the start of the string
		subjectPart = requestURI[:lastIndex]
	}

	subject, err := url.PathUnescape(subjectPart)
	if err != nil {
		subject = subjectPart
	}

	return subject
}
