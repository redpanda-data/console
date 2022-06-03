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
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/redpanda-data/console/backend/pkg/console"
)

func (api *API) handleGetEndpoints() http.HandlerFunc {
	type response struct {
		EndpointCompatibility console.EndpointCompatibility `json:"endpointCompatibility"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		endpointCompatibility, err := api.ConsoleSvc.GetEndpointCompatibility(r.Context())
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not get cluster config",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		response := response{
			EndpointCompatibility: endpointCompatibility,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}
