package api

import (
	"fmt"
	"github.com/go-chi/chi"
	"github.com/twmb/franz-go/pkg/kmsg"
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
			if !canSee {
				continue
			}

			// Attach allowed actions for each topic
			group.AllowedActions, restErr = api.Hooks.Owl.AllowedConsumerGroupActions(r.Context(), group.GroupID)
			if restErr != nil {
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			}
			visibleGroups = append(visibleGroups, group)
		}

		response := GetConsumerGroupsResponse{
			ConsumerGroups: visibleGroups,
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

type patchConsumerGroupRequest struct {
	GroupID string `json:"groupId"`
	Topics  []struct {
		// Topic is a topic to commit offsets for.
		TopicName string `json:"topicName"`

		// Partitions contains partitions in a topic for which to commit offsets.
		Partitions []struct {
			ID     int32 `json:"partitionId"`
			Offset int64 `json:"offset"`
		} `json:"partitions"`
	} `json:"topics"`
}

func (p *patchConsumerGroupRequest) OK() error {
	if len(p.Topics) == 0 {
		return fmt.Errorf("at least one topic and partition must be set")
	}
	for _, topic := range p.Topics {
		if len(topic.Partitions) == 0 {
			return fmt.Errorf("topic '%v' has no partitions set to be edited", topic.TopicName)
		}

		for _, partition := range topic.Partitions {
			if partition.Offset < -2 {
				return fmt.Errorf("topic '%v', partition '%v' has an invalid offset < -2", topic.TopicName, partition.ID)
			}
		}
	}

	return nil
}

func (api *API) handlePatchConsumerGroup() http.HandlerFunc {
	type response struct {
		*owl.EditConsumerGroupOffsetsResponse
	}
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse and validate request
		var req patchConsumerGroupRequest
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 2. Check if logged in user is allowed to edit Consumer Group (always true for Kowl, but not for Kowl Business)
		canEdit, restErr := api.Hooks.Owl.CanEditConsumerGroup(r.Context(), req.GroupID)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canEdit {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to edit consumer group"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to edit this consumer group",
				InternalLogs: []zapcore.Field{zap.String("group_id", req.GroupID)},
				IsSilent:     false,
			})
			return
		}

		// 3. Submit edit offset request
		kmsgReq := make([]kmsg.OffsetCommitRequestTopic, len(req.Topics))
		for i, topic := range req.Topics {
			partitions := make([]kmsg.OffsetCommitRequestTopicPartition, len(topic.Partitions))
			for j, partition := range topic.Partitions {
				partitionReq := kmsg.NewOffsetCommitRequestTopicPartition()
				partitionReq.Partition = partition.ID
				partitionReq.Offset = partition.Offset
				partitions[j] = partitionReq
			}
			topicReq := kmsg.NewOffsetCommitRequestTopic()
			topicReq.Topic = topic.TopicName
			topicReq.Partitions = partitions
			kmsgReq[i] = topicReq
		}

		// 4. Check response and pass it to the frontend
		res, restErr := api.OwlSvc.EditConsumerGroupOffsets(r.Context(), req.GroupID, kmsgReq)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, response{res})
	}
}

type deleteConsumerGroupRequest struct {
	GroupID string `json:"groupId"`
	Topics  []struct {
		// Topic is a topic to commit offsets for.
		TopicName string `json:"topicName"`

		// Partitions whose group offsets shall get deleted
		Partitions []struct {
			ID int32 `json:"partitionId"`
		} `json:"partitions"`
	} `json:"topics"`
}

func (p *deleteConsumerGroupRequest) OK() error {
	if len(p.Topics) == 0 {
		return fmt.Errorf("at least one topic and partition must be set")
	}
	for _, topic := range p.Topics {
		if len(topic.Partitions) == 0 {
			return fmt.Errorf("topic '%v' has no partitions set to be deleted", topic.TopicName)
		}
	}

	return nil
}

func (api *API) handleDeleteConsumerGroupOffsets() http.HandlerFunc {
	type response struct {
		Topics []owl.DeleteConsumerGroupOffsetsResponseTopic `json:"topics"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse and validate request
		var req deleteConsumerGroupRequest
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 2. Check if logged in user is allowed to delete Consumer Group (always true for Kowl, but not for Kowl Business)
		canDelete, restErr := api.Hooks.Owl.CanDeleteConsumerGroup(r.Context(), req.GroupID)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canDelete {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to edit consumer group"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to edit this consumer group",
				InternalLogs: []zapcore.Field{zap.String("group_id", req.GroupID)},
				IsSilent:     false,
			})
			return
		}

		// 3. Submit delete offset request
		kmsgReq := make([]kmsg.OffsetDeleteRequestTopic, len(req.Topics))
		for i, topic := range req.Topics {
			partitions := make([]kmsg.OffsetDeleteRequestTopicPartition, len(topic.Partitions))
			for j, partition := range topic.Partitions {
				partitionReq := kmsg.NewOffsetDeleteRequestTopicPartition()
				partitionReq.Partition = partition.ID
				partitions[j] = partitionReq
			}
			topicReq := kmsg.NewOffsetDeleteRequestTopic()
			topicReq.Topic = topic.TopicName
			topicReq.Partitions = partitions
			kmsgReq[i] = topicReq
		}

		// 4. Check response and pass it to the frontend
		deletedTopics, err := api.OwlSvc.DeleteConsumerGroupOffsets(r.Context(), req.GroupID, kmsgReq)
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusServiceUnavailable,
				Message:  fmt.Sprintf("Delete consumer group offset request has failed: %v", err.Error()),
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		res := response{Topics: deletedTopics}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}
