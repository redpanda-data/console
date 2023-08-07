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
	"fmt"
	"net/http"

	"github.com/cloudhut/common/rest"
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
