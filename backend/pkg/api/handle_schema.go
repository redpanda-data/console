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
		subject := rest.GetURLParam(r, "subject")
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
