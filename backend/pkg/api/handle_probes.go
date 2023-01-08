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
)

func (api *API) handleLivenessProbe() http.HandlerFunc {
	type response struct {
		IsHTTPOk bool `json:"isHttpOk"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		res := &response{
			IsHTTPOk: true,
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleStartupProbe() http.HandlerFunc {
	type response struct {
		IsHTTPOk  bool `json:"isHttpOk"`
		IsKafkaOk bool `json:"isKafkaOk"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// Check Kafka connectivity
		isKafkaOK := false
		err := api.KafkaSvc.IsHealthy(r.Context())
		if err == nil {
			isKafkaOK = true
		}

		res := &response{
			IsHTTPOk:  true,
			IsKafkaOk: isKafkaOK,
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}
