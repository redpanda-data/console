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
	"net/http"

	"github.com/cloudhut/common/rest"
)

func (api *API) handleOverview() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		overview := api.ConsoleSvc.GetOverview(r.Context())
		overview.Console.License = api.License
		rest.SendResponse(w, r, api.Logger, http.StatusOK, overview)
	}
}
