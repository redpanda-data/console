package main

import (
	"net/http"

	"github.com/weeco/kafka-explorer/pkg/common/rest"
	"github.com/weeco/kafka-explorer/pkg/kafka"
)

func (api *API) handleDescribeCluster() http.HandlerFunc {
	type response struct {
		ClusterInfo *kafka.ClusterInfo `json:"clusterInfo"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		clusterInfo, err := api.kafkaSvc.DescribeCluster()
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not describe cluster",
				IsSilent: false,
			}
			api.restHelper.SendRESTError(w, r, restErr)
			return
		}

		response := response{
			ClusterInfo: clusterInfo,
		}
		api.restHelper.SendResponse(w, r, http.StatusOK, response)
	}
}
