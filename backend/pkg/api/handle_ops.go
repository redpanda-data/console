package api

import (
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"net/http"
)

func (api *API) handleGetPartitionReassignments() http.HandlerFunc {
	type response struct {
		Topics []owl.PartitionReassignments `json:"topics"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topics, err := api.OwlSvc.ListPartitionReassignments(r.Context())
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list active partition reassignments",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		response := response{
			Topics: topics,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}
