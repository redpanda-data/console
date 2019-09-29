package main

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi"
	"github.com/gorilla/schema"
	"github.com/weeco/kafka-explorer/pkg/common/rest"
	"github.com/weeco/kafka-explorer/pkg/kafka"
)

func (api *API) handleGetTopics() http.HandlerFunc {
	type response struct {
		Topics []*kafka.TopicDetail `json:"topics"`
	}
	return func(w http.ResponseWriter, r *http.Request) {

		topics, err := api.kafkaSvc.ListTopics()
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list topics from Kafka cluster",
				IsSilent: false,
			}
			api.restHelper.SendRESTError(w, r, restErr)
			return
		}

		response := response{
			Topics: topics,
		}
		api.restHelper.SendResponse(w, r, http.StatusOK, response)
	}
}

// GetTopicMessagesResponse is a wrapper for an array of TopicMessage
type GetTopicMessagesResponse struct {
	KafkaMessages *kafka.ListMessageResponse `json:"kafkaMessages"`
}

func (api *API) handleGetMessages() http.HandlerFunc {
	decoder := schema.NewDecoder()
	decoder.IgnoreUnknownKeys(true)
	type request struct {
		StartOffset int64  `schema:"startOffset,required"` // -1 for newest, -2 for oldest offset
		PartitionID int32  `schema:"partitionID,required"` // -1 for all partition ids
		PageSize    uint16 `schema:"pageSize,required"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := chi.URLParam(r, "topicName")
		query := r.URL.Query()

		var req request
		err := decoder.Decode(&req, query)
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusBadRequest,
				Message:  "The given query parameters are invalid",
				IsSilent: false,
			}
			api.restHelper.SendRESTError(w, r, restErr)
			return
		}

		// Request messages from kafka and return them once we got all the messages or the context is done
		listReq := kafka.ListMessageRequest{
			TopicName:    topicName,
			PartitionID:  req.PartitionID,
			StartOffset:  req.StartOffset,
			MessageCount: req.PageSize,
		}
		ctx, cancelCtx := context.WithTimeout(r.Context(), 18*time.Second)
		defer cancelCtx()
		messages, err := api.kafkaSvc.ListMessages(ctx, listReq)
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list messages for requested topic",
				IsSilent: false,
			}
			api.restHelper.SendRESTError(w, r, restErr)
			return
		}

		response := &GetTopicMessagesResponse{
			KafkaMessages: messages,
		}
		api.restHelper.SendResponse(w, r, http.StatusOK, response)
	}
}

// handleGetTopicConfig returns all set configuration options for a specific topic
func (api *API) handleGetTopicConfig() http.HandlerFunc {
	type response struct {
		TopicDescription *kafka.TopicDescription `json:"topicDescription"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := chi.URLParam(r, "topicName")
		description, err := api.kafkaSvc.DescribeTopicConfigs(topicName)
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list topic config for requested topic",
				IsSilent: false,
			}
			api.restHelper.SendRESTError(w, r, restErr)
			return
		}

		res := response{
			TopicDescription: description,
		}
		api.restHelper.SendResponse(w, r, http.StatusOK, res)
	}
}
