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
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/sr"

	"github.com/redpanda-data/console/backend/pkg/console"
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
	if !api.Cfg.SchemaRegistry.Enabled {
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

func (api *API) handleGetSchemaRegistrySchemaTypes() http.HandlerFunc {
	if !api.Cfg.SchemaRegistry.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
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
	if !api.Cfg.SchemaRegistry.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
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
	if !api.Cfg.SchemaRegistry.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		res, err := api.ConsoleSvc.GetSchemaRegistryConfig(r.Context(), "")
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
	if !api.Cfg.SchemaRegistry.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	type request struct {
		Compatibility sr.CompatibilityLevel `json:"compatibility"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		req := request{}
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		res, err := api.ConsoleSvc.PutSchemaRegistryConfig(r.Context(), "", sr.SetCompatibility{Level: req.Compatibility})
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
	if !api.Cfg.SchemaRegistry.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	type request struct {
		Compatibility sr.CompatibilityLevel `json:"compatibility"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse request parameters
		subjectName := getSubjectFromRequestPath(r)

		req := request{}
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 2. Set subject compatibility level
		res, err := api.ConsoleSvc.PutSchemaRegistryConfig(r.Context(), subjectName, sr.SetCompatibility{Level: req.Compatibility})
		if err != nil {
			var schemaError *sr.ResponseError
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
				Message:  fmt.Sprintf("Failed to set subject's compatibility level: %v", err.Error()),
				IsSilent: false,
			})
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleDeleteSchemaRegistrySubjectConfig() http.HandlerFunc {
	if !api.Cfg.SchemaRegistry.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse request parameters
		subjectName := getSubjectFromRequestPath(r)

		// 2. Set subject compatibility level
		err := api.ConsoleSvc.DeleteSchemaRegistrySubjectConfig(r.Context(), subjectName)
		if err != nil {
			var schemaError *sr.ResponseError
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
				Message:  fmt.Sprintf("Failed to delete subject's compatibility level: %v", err.Error()),
				IsSilent: false,
			})
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}

func (api *API) handleGetSchemaSubjects() http.HandlerFunc {
	if !api.Cfg.SchemaRegistry.Enabled {
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
	if !api.Cfg.SchemaRegistry.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
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
			var schemaError *sr.ResponseError
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

func (api *API) handleGetSchemaReferencedBy() http.HandlerFunc {
	if !api.Cfg.SchemaRegistry.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse request params
		subjectName := getSubjectFromRequestPath(r)

		// 2. Parse and validate version input
		versionStr := rest.GetURLParam(r, "version")
		version, restErr := parseVersionStr(versionStr)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 3. Get all subjects' details
		res, err := api.ConsoleSvc.GetSchemaRegistrySchemaReferencedBy(r.Context(), subjectName, version)
		if err != nil {
			var schemaError *sr.ResponseError
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
				Message:  fmt.Sprintf("Failed to retrieve schema references from the schema registry: %v", err.Error()),
				IsSilent: false,
			})
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleDeleteSubject() http.HandlerFunc {
	if !api.Cfg.SchemaRegistry.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
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
			var schemaError *sr.ResponseError
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
				InternalLogs: []slog.Attr{slog.String("subject_name", subjectName)},
				IsSilent:     false,
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func parseVersionStr(versionStr string) (int, *rest.Error) {
	if versionStr == console.SchemaVersionsLatest {
		return -1, nil
	}

	// Must be number or it's invalid input
	version, err := strconv.Atoi(versionStr)
	if err != nil {
		descriptiveErr := fmt.Errorf("version %q is not valid. Must be %q or a positive integer", version, console.SchemaVersionsLatest)
		return 0, &rest.Error{
			Err:      descriptiveErr,
			Status:   http.StatusBadRequest,
			Message:  descriptiveErr.Error(),
			IsSilent: false,
		}
	}

	return version, nil
}

func (api *API) handleDeleteSubjectVersion() http.HandlerFunc {
	if !api.Cfg.SchemaRegistry.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse request parameters
		subjectName := getSubjectFromRequestPath(r)

		versionStr := rest.GetURLParam(r, "version")
		version, restErr := parseVersionStr(versionStr)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
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
			var schemaError *sr.ResponseError
			if errors.As(err, &schemaError) && schemaError.ErrorCode == 40401 {
				rest.SendRESTError(w, r, api.Logger, &rest.Error{
					Err:      err,
					Status:   http.StatusNotFound,
					Message:  "Requested subject does not exist",
					IsSilent: false,
				})
				return
			}
			if errors.As(err, &schemaError) && schemaError.ErrorCode == 40402 {
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
				InternalLogs: []slog.Attr{
					slog.String("subject_name", subjectName),
					slog.Int("version", version),
				},
				IsSilent: false,
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleCreateSchema() http.HandlerFunc {
	if !api.Cfg.SchemaRegistry.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse request parameters
		subjectName := getSubjectFromRequestPath(r)

		var payload sr.Schema
		restErr := rest.Decode(w, r, &payload)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if payload.Schema == "" {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          errors.New("payload validation failed for creating schema"),
				Status:       http.StatusBadRequest,
				Message:      "You must set the schema field when creating a new schema",
				InternalLogs: []slog.Attr{slog.String("subject_name", subjectName)},
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
				InternalLogs: []slog.Attr{slog.String("subject_name", subjectName)},
				IsSilent:     false,
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleValidateSchema() http.HandlerFunc {
	if !api.Cfg.SchemaRegistry.Enabled {
		return api.handleSchemaRegistryNotConfigured()
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse request parameters
		subjectName := getSubjectFromRequestPath(r)

		versionStr := rest.GetURLParam(r, "version")
		version, restErr := parseVersionStr(versionStr)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		var payload sr.Schema
		if restErr := rest.Decode(w, r, &payload); restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if payload.Schema == "" {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          errors.New("payload validation failed for validating schema"),
				Status:       http.StatusBadRequest,
				Message:      "You must set the schema field when validating the schema",
				InternalLogs: []slog.Attr{slog.String("subject_name", subjectName)},
				IsSilent:     false,
			})
			return
		}

		// 2. Send validate request
		res, err := api.ConsoleSvc.ValidateSchemaRegistrySchema(r.Context(), subjectName, version, sr.Schema{
			Schema:     payload.Schema,
			Type:       payload.Type,
			References: payload.References,
		})
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("failed validating schema: %w", err),
				Status:       http.StatusBadRequest,
				Message:      fmt.Sprintf("Failed validating schema: %v", err.Error()),
				InternalLogs: []slog.Attr{slog.String("subject_name", subjectName)},
				IsSilent:     false,
			})
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func getSubjectFromRequestPath(r *http.Request) string {
	// Subject extraction is a little tricky.
	// Subjects can have characters such as "/" and "%"".
	// Subjects are passed to the router as part of path parameter, URL escaped.
	// However, there seems to be _some_ unescaping within Go's HTTP request itself.
	// If a subject is "%2F", the subject path parameter would be "%252F".
	// With an HTTP request path like "/api/schema-registry/subjects/%252F/versions/latest"
	// Go's HTTP request.URL.Path is "/api/schemas/schema-registry/%2F/versions/latest",
	// which is already unescaped.
	// While Go HTTP request.RequestURI is "/api/schemas/schema-registry/%252F/versions/latest"
	// Which is the raw version that the client sent.
	// That means that if we use rest.GetURLParam(),
	// it first calls chi.URLParam() to get the path param, which returns "%2F"
	// Which then url.PathUnescape() within rest.GetURLParam() to finally return "/".
	// which is "double escaped" and _not_ what we want.
	// So that means we have to manually extract and unescape the subject part ourselves
	// from the raw path in request.RequestURI.
	// See url.setPath() and parse() functions in url.go.

	requestURI := r.RequestURI

	// remove the api route prefix
	requestURI = strings.Replace(requestURI, r.URL.Scheme+"://", "", 1)
	requestURI = strings.Replace(requestURI, r.Host, "", 1)
	requestURI = strings.Replace(requestURI, "/api/schema-registry/subjects/", "", 1)
	requestURI = strings.Replace(requestURI, "/api/schema-registry/config/", "", 1)
	if r.URL.RawQuery != "" {
		requestURI = strings.TrimSuffix(requestURI, "?"+r.URL.RawQuery)
	}

	// find the versions suffix of the path
	subjectPart := requestURI
	lastIndex := strings.Index(requestURI, "/")
	if lastIndex > 0 { // satisfy linter
		// and extract the subject at the start of the string
		subjectPart = requestURI[:lastIndex]
	}

	// finally unescape
	subject, err := url.PathUnescape(subjectPart)
	if err != nil {
		subject = subjectPart
	}

	return subject
}
