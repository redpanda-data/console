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
	"strconv"
	"strings"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/console"
)

func (api *API) handleGetTopics() http.HandlerFunc {
	type response struct {
		Topics []*console.TopicSummary `json:"topics"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topics, err := api.ConsoleSvc.GetTopicsOverview(r.Context())
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list topics from Kafka cluster",
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

// handleGetPartitions returns an overview of all partitions and their watermarks in the given topic
func (api *API) handleGetPartitions() http.HandlerFunc {
	type response struct {
		TopicName  string                          `json:"topicName"`
		Partitions []console.TopicPartitionDetails `json:"partitions"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := rest.GetURLParam(r, "topicName")
		logger := api.Logger.With(slog.String("topic_name", topicName))

		topicDetails, restErr := api.ConsoleSvc.GetTopicDetails(r.Context(), []string{topicName})
		if restErr != nil {
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		if len(topicDetails) != 1 {
			restErr := &rest.Error{
				Err:      fmt.Errorf("expected exactly one topic detail in response, but got '%d'", len(topicDetails)),
				Status:   http.StatusInternalServerError,
				Message:  "Internal server error in RP Console, please file a issue in GitHub if you face this issue. The backend logs will contain more information.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		res := response{
			TopicName:  topicName,
			Partitions: topicDetails[0].Partitions,
		}
		rest.SendResponse(w, r, logger, http.StatusOK, res)
	}
}

// handleGetTopicConfig returns all set configuration options for a specific topic
func (api *API) handleGetTopicConfig() http.HandlerFunc {
	type response struct {
		TopicDescription *console.TopicConfig `json:"topicDescription"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := rest.GetURLParam(r, "topicName")
		logger := api.Logger.With(slog.String("topic_name", topicName))

		description, restErr := api.ConsoleSvc.GetTopicConfigs(r.Context(), topicName, nil)
		if restErr != nil {
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		res := response{
			TopicDescription: description,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleDeleteTopic() http.HandlerFunc {
	type response struct {
		Status string `json:"status"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := rest.GetURLParam(r, "topicName")

		restErr := api.ConsoleSvc.DeleteTopic(r.Context(), topicName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, response{Status: "Success"})
	}
}

type deleteTopicRecordsRequest struct {
	// Partitions contains partitions to delete records from.
	Partitions []struct {
		// Partition is a partition to delete records from.
		Partition int32 `json:"partitionId"`

		// Offset is the offset to set the partition's low watermark (start
		// offset) to. After a successful response, all records before this
		// offset are considered deleted and are no longer readable.
		//
		// To delete all records, use -1, which is mapped to the partition's
		// current high watermark.
		Offset int64 `json:"offset"`
	} `json:"partitions"`
}

func (d *deleteTopicRecordsRequest) OK() error {
	if len(d.Partitions) == 0 {
		return errors.New("at least one partition must be specified")
	}

	for _, partition := range d.Partitions {
		if partition.Offset < -1 {
			return errors.New("partition offset must be greater than -1")
		}
	}

	return nil
}

func (api *API) handleDeleteTopicRecords() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		topicName := rest.GetURLParam(r, "topicName")

		// 1. Parse and validate request
		var req deleteTopicRecordsRequest
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 3. Submit delete topic records request
		deleteReq := kmsg.NewDeleteRecordsRequestTopic()
		deleteReq.Topic = topicName
		deleteReq.Partitions = make([]kmsg.DeleteRecordsRequestTopicPartition, len(req.Partitions))
		for i, partition := range req.Partitions {
			pReq := kmsg.NewDeleteRecordsRequestTopicPartition()
			pReq.Partition = partition.Partition
			pReq.Offset = partition.Offset
			deleteReq.Partitions[i] = pReq
		}

		deleteRes, restErr := api.ConsoleSvc.DeleteTopicRecords(r.Context(), deleteReq)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, deleteRes)
	}
}

type editTopicConfigRequest struct {
	// Configs is the config entries that shall be modified on the given topic.
	Configs []struct {
		// Key is a key to modify (e.g. segment.bytes).
		Key string `json:"key"`

		// Op is the type of operation to perform for this config name.
		// Valid values are: "set", "delete", "append", "subtract".
		// If this field is omitted, it will default to SET.
		//
		// SET (0) is to set a configuration value; the value must not be null.
		//
		// DELETE (1) is to delete a configuration key.
		//
		// APPEND (2) is to add a value to the list of values for a key (if the
		// key is for a list of values).
		//
		// SUBTRACT (3) is to remove a value from a list of values (if the key
		// is for a list of values).
		Op kmsg.IncrementalAlterConfigOp `json:"op"`

		// Value is a value to set for the key (e.g. 10).
		Value *string `json:"value"`
	} `json:"configs"`
}

func (e *editTopicConfigRequest) OK() error {
	if len(e.Configs) == 0 {
		return errors.New("you must set at least one config entry that shall be modified")
	}
	for _, cfg := range e.Configs {
		if cfg.Key == "" {
			return errors.New("at least one config key was not set. config keys must always be set")
		}
	}

	return nil
}

func (api *API) handleEditTopicConfig() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse and validate request
		topicName := rest.GetURLParam(r, "topicName")
		if topicName == "" {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      errors.New("topic name must be set"),
				Status:   http.StatusBadRequest,
				Message:  "Topic name must be set",
				IsSilent: false,
			})
			return
		}

		var req editTopicConfigRequest
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 3. Submit edit topic config request
		configRequests := make([]kmsg.IncrementalAlterConfigsRequestResourceConfig, 0, len(req.Configs))
		for _, cfg := range req.Configs {
			resourceCfg := kmsg.NewIncrementalAlterConfigsRequestResourceConfig()
			resourceCfg.Name = cfg.Key
			resourceCfg.Op = cfg.Op
			resourceCfg.Value = cfg.Value
			configRequests = append(configRequests, resourceCfg)
		}

		err := api.ConsoleSvc.EditTopicConfig(r.Context(), topicName, configRequests)
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("failed to edit topic config: %w", err),
				Status:       http.StatusServiceUnavailable,
				Message:      fmt.Sprintf("Failed to edit topic config: %v", err.Error()),
				InternalLogs: []slog.Attr{slog.String("topic_name", topicName)},
				IsSilent:     false,
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}

// handleGetTopicsConfigs returns all set configuration options for one or more topics
func (api *API) handleGetTopicsConfigs() http.HandlerFunc {
	type response struct {
		TopicDescriptions []*console.TopicConfig `json:"topicDescriptions"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse optional filters. If no filter is set they will be treated as wildcards
		var topicNames []string
		requestedTopicNames := rest.GetQueryParam(r, "topicNames")
		if requestedTopicNames != "" {
			topicNames = strings.Split(requestedTopicNames, ",")
		}

		var configKeys []string
		requestedConfigKeys := rest.GetQueryParam(r, "configKeys")
		if requestedConfigKeys != "" {
			configKeys = strings.Split(requestedConfigKeys, ",")
		}

		logger := api.Logger.With(slog.Int("topics_length", len(topicNames)), slog.Int("config_keys_length", len(configKeys)))

		// 2. Fetch all topic names from metadata as no topic filter has been specified
		if len(topicNames) == 0 {
			var err error
			topicNames, err = api.ConsoleSvc.GetAllTopicNames(r.Context())
			if err != nil {
				restErr := &rest.Error{
					Err:      fmt.Errorf("failed to request metadata to fetch topic names: %w", err),
					Status:   http.StatusForbidden,
					Message:  fmt.Sprintf("Failed to fetch metadata from brokers to fetch topicNames '%v'", err.Error()),
					IsSilent: false,
				}
				rest.SendRESTError(w, r, logger, restErr)
				return
			}
		}

		// 4. Request topics configs and return them
		descriptions, err := api.ConsoleSvc.GetTopicsConfigs(r.Context(), topicNames, configKeys)
		if err != nil {
			restErr := &rest.Error{
				Err:      fmt.Errorf("failed to describe topic configs: %w", err),
				Status:   http.StatusServiceUnavailable,
				Message:  fmt.Sprintf("Failed to describe topic configs '%v'", err.Error()),
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}
		result := make([]*console.TopicConfig, 0, len(descriptions))
		for _, description := range descriptions {
			result = append(result, description)
		}

		res := response{
			TopicDescriptions: result,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

// handleGetTopicConsumers returns all consumers along with their summed lag which consume the given topic
func (api *API) handleGetTopicConsumers() http.HandlerFunc {
	type response struct {
		TopicName string                        `json:"topicName"`
		Consumers []*console.TopicConsumerGroup `json:"topicConsumers"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := rest.GetURLParam(r, "topicName")
		logger := api.Logger.With(slog.String("topic_name", topicName))

		consumers, err := api.ConsoleSvc.ListTopicConsumers(r.Context(), topicName)
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list topic consumers for requested topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		res := response{
			TopicName: topicName,
			Consumers: consumers,
		}
		rest.SendResponse(w, r, logger, http.StatusOK, res)
	}
}

func (api *API) handleGetTopicsOffsets() http.HandlerFunc {
	type response struct {
		TopicOffsets []console.TopicOffset `json:"topicOffsets"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse topic names and timestamp from URL. It's a list of topic names that is comma separated
		requestedTopicNames := rest.GetQueryParam(r, "topicNames")
		if requestedTopicNames == "" {
			restErr := &rest.Error{
				Err:      errors.New("required parameter topicNames is missing"),
				Status:   http.StatusBadRequest,
				Message:  "Required parameter topicNames is missing",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		topicNames := strings.Split(requestedTopicNames, ",")

		timestampStr := rest.GetQueryParam(r, "timestamp")
		if timestampStr == "" {
			restErr := &rest.Error{
				Err:      errors.New("required parameter timestamp is missing"),
				Status:   http.StatusBadRequest,
				Message:  "Required parameter timestamp is missing",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		timestamp, err := strconv.Atoi(timestampStr)
		if err != nil {
			restErr := &rest.Error{
				Err:      errors.New("timestamp parameter must be a valid int"),
				Status:   http.StatusBadRequest,
				Message:  "Timestamp parameter must be a valid int",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 3. Request topic
		topicOffsets, err := api.ConsoleSvc.ListOffsets(r.Context(), topicNames, int64(timestamp))
		if err != nil {
			restErr := &rest.Error{
				Err:      fmt.Errorf("failed to list offsets: %w", err),
				Status:   http.StatusForbidden,
				Message:  fmt.Sprintf("Failed to list offsets from Kafka: %v", err.Error()),
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		res := response{
			TopicOffsets: topicOffsets,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}
