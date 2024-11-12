// Copyright 2024 Redpanda Data, Inc.
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
	"go.uber.org/zap"
)

// handleGetProducerCompressionType returns the default producer compression type
func (api *API) handleGetProducerCompressionType() http.HandlerFunc {
	type response struct {
		ProducerCompressionType string `json:"producerCompressionType"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		producerCompressionType := api.Cfg.Kafka.PComp.Value
		logger := api.Logger.With(zap.String("producer_compression_type", producerCompressionType))

		rest.SendResponse(w, r, logger, http.StatusOK, &response{
			ProducerCompressionType: producerCompressionType,
		})
	}
}
