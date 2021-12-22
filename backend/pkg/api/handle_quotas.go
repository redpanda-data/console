package api

import (
	"fmt"
	"github.com/cloudhut/common/rest"
	"net/http"
)

func (api *API) handleGetQuotas() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		quotas := api.OwlSvc.DescribeQuotas(r.Context())

		// Check if logged in user is allowed to list Quotas
		isAllowed, restErr := api.Hooks.Owl.CanListQuotas(r.Context())
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
