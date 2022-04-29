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
	"fmt"
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"github.com/go-chi/chi"
	"net/http"
)

func (api *API) handleGetSchemaOverview() http.HandlerFunc {
	type response struct {
		SchemaOverview *owl.SchemaOverview `json:"schemaOverview"`
		IsConfigured   bool                `json:"isConfigured"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		overview, err := api.OwlSvc.GetSchemaOverview(r.Context())
		if err != nil {
			if err == owl.ErrSchemaRegistryNotConfigured {
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
		SchemaDetails *owl.SchemaDetails `json:"schemaDetails"`
		IsConfigured  bool               `json:"isConfigured"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		subject := chi.URLParam(r, "subject")
		version := chi.URLParam(r, "version")
		schemaDetails, err := api.OwlSvc.GetSchemaDetails(r.Context(), subject, version)
		if err != nil {
			if err == owl.ErrSchemaRegistryNotConfigured {
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
