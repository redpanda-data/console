package api

import (
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"net/http"
)

func (api *API) handleGetEndpoints() http.HandlerFunc {
	type response struct {
		EndpointCompatibility owl.EndpointCompatibility `json:"endpointCompatibility"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		endpointCompatibility, err := api.OwlSvc.GetEndpointCompatibility(r.Context())
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

		response := response{
			EndpointCompatibility: endpointCompatibility,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}
