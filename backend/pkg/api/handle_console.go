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
	"fmt"
	"net/http"
	"time"

	"github.com/cloudhut/common/rest"
	"golang.org/x/exp/maps"

	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

const (
	// KafkaDistributionApacheKafka is a string enum that denotes that we are talking
	// to an Apache Kafka cluster. Frontend features that are exclusive to other distributions
	// can be hidden based on that information.
	KafkaDistributionApacheKafka = "apache_kafka"
	// KafkaDistributionRedpanda is a string enum that denotes that we are talking
	// to a Redpanda cluster. Frontend features that are exclusive to other distributions
	// can be hidden based on that information.
	KafkaDistributionRedpanda = "redpanda"
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

		// The enterprise version may provide additional endpoints. We want to report what
		// endpoints are available, so that we can consider these features as well in the frontend.
		// We want to merge what we got reported from the hooks into the original response.
		hookedEndpointCompatibility := api.Hooks.Console.EndpointCompatibility()
		originalEndpoints := endpointCompatibility.Endpoints
		endpointCompatibility.Endpoints = mergeCompatibilityEndpoints(originalEndpoints, hookedEndpointCompatibility)

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
		licenses := []redpanda.License{api.License}
		if api.RedpandaSvc != nil {
			licenses = append(licenses, api.RedpandaSvc.GetLicense(childCtx))
		}

		response := response{
			Licenses:              licenses,
			Distribution:          distribution,
			EndpointCompatibility: endpointCompatibility,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}

// mergeCompatibilityEndpoints merges the reported compatible/enabled endpoints from b into a. We will overwrite
// existing endpoints if a 2-tuple of <endpoint, method> already exists in the given slice.
func mergeCompatibilityEndpoints(a, b []console.EndpointCompatibilityEndpoint) []console.EndpointCompatibilityEndpoint {
	keyFromEndpoint := func(e console.EndpointCompatibilityEndpoint) string {
		return fmt.Sprintf("%v-%v", e.Method, e.Endpoint)
	}

	distinctEndpoints := make(map[string]console.EndpointCompatibilityEndpoint)
	for _, entry := range a {
		key := keyFromEndpoint(entry)
		distinctEndpoints[key] = entry
	}

	for _, entry := range b {
		key := keyFromEndpoint(entry)
		distinctEndpoints[key] = entry
	}

	return maps.Values(distinctEndpoints)
}
