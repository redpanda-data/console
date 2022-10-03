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
	"net/http"
	"strconv"

	"github.com/cloudhut/common/rest"
	"github.com/go-chi/chi"
	"github.com/redpanda-data/console/backend/pkg/console"
)

func (api *API) handleBrokerConfig() http.HandlerFunc {
	type response struct {
		BrokerConfigs []console.BrokerConfigEntry `json:"brokerConfigs"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse broker ID parameter and validate input
		brokerIDStr := chi.URLParam(r, "brokerID")
		if brokerIDStr == "" || len(brokerIDStr) > 10 {
			restErr := &rest.Error{
				Err:      fmt.Errorf("broker id in URL not set"),
				Status:   http.StatusBadRequest,
				Message:  "Broker ID must be set and no longer than 10 characters",
				IsSilent: true,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		brokerID, err := strconv.ParseInt(brokerIDStr, 10, 32)
		if err != nil {
			restErr := &rest.Error{
				Err:      fmt.Errorf("broker id in URL not set"),
				Status:   http.StatusBadRequest,
				Message:  "Broker ID must be a valid int32",
				IsSilent: true,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		cfgs, restErr := api.ConsoleSvc.GetBrokerConfig(r.Context(), int32(brokerID))
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		response := response{
			BrokerConfigs: cfgs,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}
