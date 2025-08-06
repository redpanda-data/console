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

func (api *API) handleGetQuotas() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		quotas := api.ConsoleSvc.DescribeQuotas(r.Context())

		rest.SendResponse(w, r, api.Logger, http.StatusOK, quotas)
	}
}
