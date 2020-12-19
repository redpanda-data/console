package api

import (
	"fmt"
	"github.com/go-chi/chi"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
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
		describedGroups, restErr := api.OwlSvc.GetConsumerGroupsOverview(r.Context(), nil)
		if restErr != nil {
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

func (api *API) handleGetConsumerGroup() http.HandlerFunc {
	type response struct {
		ConsumerGroup owl.ConsumerGroupOverview `json:"consumerGroup"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		groupID := chi.URLParam(r, "groupId")

		canSee, restErr := api.Hooks.Owl.CanSeeConsumerGroup(r.Context(), groupID)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canSee {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to view consumer group"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to view this consumer group",
				InternalLogs: []zapcore.Field{zap.String("group_id", groupID)},
				IsSilent:     false,
			})
			return
		}

		describedGroups, restErr := api.OwlSvc.GetConsumerGroupsOverview(r.Context(), []string{groupID})
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		var res response
		if len(describedGroups) == 1 {
			res = response{ConsumerGroup: describedGroups[0]}
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}
