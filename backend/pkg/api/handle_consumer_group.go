package api

import (
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
)

// GetConsumerGroupsResponse represents the data which is returned for listing topics
type GetConsumerGroupsResponse struct {
	ConsumerGroups []owl.ConsumerGroupOverview `json:"consumerGroups"`
}

func (api *API) handleGetConsumerGroups() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		describedGroups, err := api.OwlSvc.GetConsumerGroupsOverview(r.Context())
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not get consumer groups overview",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		visibleGroups := make([]owl.ConsumerGroupOverview, 0, len(describedGroups))
		for _, group := range describedGroups {
			canSee, restErr := api.Hooks.Owl.CanSeeConsumerGroup(r.Context(), group.GroupID)
			if restErr != nil {
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			}

			if canSee {
				visibleGroups = append(visibleGroups, group)
			}

			// Attach allowed actions for each topic
			group.AllowedActions, restErr = api.Hooks.Owl.AllowedConsumerGroupActions(r.Context(), group.GroupID)
			if restErr != nil {
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			}
		}

		response := GetConsumerGroupsResponse{
			ConsumerGroups: describedGroups,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}
