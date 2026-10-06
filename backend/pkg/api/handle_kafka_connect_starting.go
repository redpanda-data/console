// Copyright 2026 Redpanda Data, Inc.
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
	"strconv"

	"github.com/cloudhut/common/rest"

	"github.com/redpanda-data/console/backend/pkg/connect"
)

// kafkaConnectStartingResponse is the body sent while the Kafka Connect workers
// are scaled to zero and starting. It extends the usual rest.Error body so
// existing clients keep working and newer ones can retry on their own.
type kafkaConnectStartingResponse struct {
	StatusCode           int    `json:"statusCode"`
	Message              string `json:"message"`
	Reason               string `json:"reason"`
	Phase                string `json:"phase"`
	RetryAfterSeconds    int    `json:"retryAfterSeconds"`
	EstimatedWaitSeconds int    `json:"estimatedWaitSeconds"`
}

// sendKafkaConnectError writes a Kafka Connect service error. A "starting" error
// gets a Retry-After header and the retry hints in the body; anything else is
// sent as a plain rest.Error.
func (api *API) sendKafkaConnectError(w http.ResponseWriter, r *http.Request, restErr *rest.Error) {
	se, ok := connect.AsStartingError(restErr)
	if !ok {
		rest.SendRESTError(w, r, api.Logger, restErr)
		return
	}
	w.Header().Set("Retry-After", strconv.Itoa(se.RetryAfterSeconds()))
	rest.SendResponse(w, r, api.Logger, http.StatusServiceUnavailable, kafkaConnectStartingResponse{
		StatusCode:           http.StatusServiceUnavailable,
		Message:              se.Message,
		Reason:               connect.StartingReason,
		Phase:                se.Phase,
		RetryAfterSeconds:    se.RetryAfterSeconds(),
		EstimatedWaitSeconds: int(se.EstimatedWait.Round(1e9).Seconds()),
	})
}
