package api

import (
	"net/http"

	"github.com/kafka-owl/kafka-owl/pkg/common/rest"
	"github.com/kafka-owl/kafka-owl/pkg/owl"
)

func (api *API) handleDescribeCluster() http.HandlerFunc {
	type response struct {
		ClusterInfo *owl.ClusterInfo `json:"clusterInfo"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		clusterInfo, err := api.OwlSvc.GetClusterInfo(r.Context())
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not describe cluster",
				IsSilent: false,
			}
			api.RestHelper.SendRESTError(w, r, restErr)
			return
		}

		response := response{
			ClusterInfo: clusterInfo,
		}
		api.RestHelper.SendResponse(w, r, http.StatusOK, response)
	}
}
