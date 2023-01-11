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

	"github.com/cloudhut/common/rest"
)

func (api *API) handleGetQuotas() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		quotas := api.ConsoleSvc.DescribeQuotas(r.Context())

		// Check if logged in user is allowed to list Quotas
		isAllowed, restErr := api.Hooks.Authorization.CanListQuotas(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !isAllowed {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("requester is not allowed to list Quotas"),
				Status:   http.StatusForbidden,
				Message:  "You are not allowed to list ACLs",
				IsSilent: true,
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, quotas)
	}
}
