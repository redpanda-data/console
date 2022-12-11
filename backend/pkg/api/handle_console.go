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
	"context"
	"net/http"
	"time"

	"github.com/cloudhut/common/rest"

	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

const (
	KafkaDistributionApacheKafka = "apache_kafka"
	KafkaDistributionRedpanda    = "redpanda"
)

func (api *API) handleGetEndpoints() http.HandlerFunc {
	type response struct {
		Licenses              []redpanda.License            `json:"licenses"`
		Distribution          string                        `json:"distribution"`
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

		distribution := KafkaDistributionApacheKafka
		if api.Cfg.Redpanda.AdminAPI.Enabled {
			distribution = KafkaDistributionRedpanda
		}

		// Get license from Redpanda cluster if Redpanda service is configured.
		// We can warn about expiring license in the Console UI.
		// Because this endpoint may block the rendering of the Frontend application
		// on startup, we limit the timeout for this call to 3s
		childCtx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		licenses := []redpanda.License{api.Hooks.Console.ConsoleLicenseInformation(childCtx)}
		if api.RedpandaSvc != nil {
			licenses = append(licenses, api.RedpandaSvc.GetLicense(r.Context()))
		}

		response := response{
			Licenses:              licenses,
			Distribution:          distribution,
			EndpointCompatibility: endpointCompatibility,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}
