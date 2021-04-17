package api

import (
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"net/http"
)

func (api *API) handleGetAPIVersions() http.HandlerFunc {
	type response struct {
		APIVersions []owl.APIVersion `json:"apiVersions"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		versions, err := api.OwlSvc.GetAPIVersions(r.Context())
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not get Kafka API versions",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		response := response{
			APIVersions: versions,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}
