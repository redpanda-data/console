// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/console"
)

// GetConsumerGroupsResponse represents the data which is returned for listing topics
type GetConsumerGroupsResponse struct {
	ConsumerGroups []console.ConsumerGroupOverview `json:"consumerGroups"`
}

func (api *API) handleGetConsumerGroups() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		describedGroups, restErr := api.ConsoleSvc.GetConsumerGroupsOverview(r.Context(), nil)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		response := GetConsumerGroupsResponse{
			ConsumerGroups: describedGroups,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}

func (api *API) handleGetConsumerGroup() http.HandlerFunc {
	type response struct {
		ConsumerGroup console.ConsumerGroupOverview `json:"consumerGroup"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		groupID := rest.GetURLParam(r, "groupId")

		describedGroups, restErr := api.ConsoleSvc.GetConsumerGroupsOverview(r.Context(), []string{groupID})
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
		return errors.New("at least one topic and partition must be set")
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
		*console.EditConsumerGroupOffsetsResponse
	}
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse and validate request
		var req patchConsumerGroupRequest
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
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
		res, restErr := api.ConsoleSvc.EditConsumerGroupOffsets(r.Context(), req.GroupID, kmsgReq)
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
		return errors.New("at least one topic and partition must be set")
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
		Topics []console.DeleteConsumerGroupOffsetsResponseTopic `json:"topics"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse and validate request
		var req deleteConsumerGroupRequest
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
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
		deletedTopics, err := api.ConsoleSvc.DeleteConsumerGroupOffsets(r.Context(), req.GroupID, kmsgReq)
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

func (api *API) handleDeleteConsumerGroup() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		groupID := rest.GetURLParam(r, "groupId")

		// 3. Submit delete offset request
		err := api.ConsoleSvc.DeleteConsumerGroup(r.Context(), groupID)
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("failed to delete consumer group: %w", err),
				Status:       http.StatusServiceUnavailable,
				Message:      fmt.Sprintf("Failed to delete consumer group: %v", err.Error()),
				InternalLogs: []slog.Attr{slog.String("group_id", groupID)},
				IsSilent:     false,
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}
