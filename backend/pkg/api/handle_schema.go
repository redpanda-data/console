// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
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
	"strings"

	"github.com/cloudhut/common/rest"

	"github.com/redpanda-data/console/backend/pkg/console"
)

func (api *API) handleGetSchemaOverview() http.HandlerFunc {
	type response struct {
		SchemaOverview *console.SchemaOverview `json:"schemaOverview"`
		IsConfigured   bool                    `json:"isConfigured"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		overview, err := api.ConsoleSvc.GetSchemaOverview(r.Context())
		if err != nil {
			if errors.Is(err, console.ErrSchemaRegistryNotConfigured) {
				rest.SendResponse(w, r, api.Logger, http.StatusOK, &response{
					SchemaOverview: nil,
					IsConfigured:   false,
				})
				return
			}

			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusServiceUnavailable,
				Message:  fmt.Sprintf("Schema overview request has failed: %v", err.Error()),
				IsSilent: false,
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, &response{
			SchemaOverview: overview,
			IsConfigured:   true,
		})
	}
}

func (api *API) handleGetSchemaDetails() http.HandlerFunc {
	type response struct {
		SchemaDetails *console.SchemaDetails `json:"schemaDetails"`
		IsConfigured  bool                   `json:"isConfigured"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// subject extraction gets complicated
		// With a path like /api/schemas/subjects/%252F/versions/latest
		// r.URL.Path is /api/schemas/subjects/%2F/versions/latest
		// while RequestURI is /api/schemas/subjects/%252F/versions/latest
		// that means that chi.URLParam() returns  %2F
		// which then url.PathUnescape() within rest.GetURLParam() returns "/"
		// which is "double escaped"
		// so we have to manually extract and escape the subject part ourselves

		requestURI := r.RequestURI
		// remove the api route prefix
		requestURI = strings.ReplaceAll(requestURI, "/api/schemas/subjects/", "")
		// find the versions suffix of the path
		subjectPart := requestURI
		versionsIndex := strings.Index(requestURI, "/versions")
		if versionsIndex > 0 { // satisfy linter
			// and extract the subject at the start of the string
			subjectPart = requestURI[:versionsIndex]
		}

		subject, err := url.PathUnescape(subjectPart)
		if err != nil {
			subject = subjectPart
		}

		version := rest.GetURLParam(r, "version")
		schemaDetails, err := api.ConsoleSvc.GetSchemaDetails(r.Context(), subject, version)
		if err != nil {
			if errors.Is(err, console.ErrSchemaRegistryNotConfigured) {
				rest.SendResponse(w, r, api.Logger, http.StatusOK, &response{
					SchemaDetails: nil,
					IsConfigured:  false,
				})
				return
			}

			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusServiceUnavailable,
				Message:  "Schema overview request has failed. Look into the server logs for more details.",
				IsSilent: false,
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, &response{
			SchemaDetails: schemaDetails,
			IsConfigured:  true,
		})
	}
}
