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
	"log/slog"
	"net/http"

	"github.com/cloudhut/common/rest"

	"github.com/redpanda-data/console/backend/pkg/console"
)

// handleGetTopicDocumentation returns the respective topic documentation from the git repository
func (api *API) handleGetTopicDocumentation() http.HandlerFunc {
	type response struct {
		TopicName     string                      `json:"topicName"`
		Documentation *console.TopicDocumentation `json:"documentation"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := rest.GetURLParam(r, "topicName")
		logger := api.Logger.With(slog.String("topic_name", topicName))

		doc := api.ConsoleSvc.GetTopicDocumentation(topicName)

		rest.SendResponse(w, r, logger, http.StatusOK, &response{
			TopicName:     topicName,
			Documentation: doc,
		})
	}
}
