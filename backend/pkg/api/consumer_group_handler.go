package api

import (
	"net/http"

	"github.com/kafka-owl/kafka-owl/pkg/common/rest"
	"github.com/kafka-owl/kafka-owl/pkg/kafka"
)

// GetConsumerGroupsResponse represents the data which is returned for listing topics
type GetConsumerGroupsResponse struct {
	ConsumerGroups []*kafka.GroupDescription `json:"consumerGroups"`
}

func (api *API) handleGetConsumerGroups() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		groups, err := api.kafkaSvc.ListConsumerGroups(r.Context())
		if err != nil {
			rerr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list consumer groups from Kafka cluster",
				IsSilent: false,
			}
			api.restHelper.SendRESTError(w, r, rerr)
			return
		}

		describedGroups, err := api.kafkaSvc.DescribeConsumerGroups(r.Context(), groups)
		if err != nil {
			rerr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not describe consumer groups in the Kafka cluster",
				IsSilent: false,
			}
			api.restHelper.SendRESTError(w, r, rerr)
			return
		}

		response := GetConsumerGroupsResponse{
			ConsumerGroups: describedGroups,
		}
		api.restHelper.SendResponse(w, r, http.StatusOK, response)
	}
}
