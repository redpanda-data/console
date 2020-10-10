package api

import (
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
)

// GetACLsOverviewResponse represents the data which is returned for listing ACLs
type GetACLsOverviewResponse struct {
	AclResources []*owl.AclResource `json:"aclResources"`
}

func (api *API) handleGetACLsOverview() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		aclResources, err := api.OwlSvc.ListAllACLs()
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list ACLs",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		response := GetACLsOverviewResponse{
			AclResources: aclResources,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}
