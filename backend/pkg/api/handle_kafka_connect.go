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
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	con "github.com/cloudhut/connect-client"
	"github.com/cloudhut/kowl/backend/pkg/connect"
	"github.com/go-chi/chi"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"github.com/cloudhut/common/rest"
)

func (api *API) handleGetConnectors() http.HandlerFunc {
	type response struct {
		IsConfigured bool                         `json:"isConfigured"`
		Clusters     []*connect.ClusterConnectors `json:"clusters"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		connectors, err := api.ConnectSvc.GetAllClusterConnectors(ctx)
		if err != nil {
			if err == connect.ErrKafkaConnectNotConfigured {
				rest.SendResponse(w, r, api.Logger, http.StatusOK, response{IsConfigured: false})
				return
			}
			restErr := &rest.Error{
				Err:      fmt.Errorf("failed to get cluster connectors: %w", err),
				Status:   http.StatusInternalServerError,
				Message:  fmt.Sprintf("Failed to get cluster connectors: %v", err.Error()),
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		for _, shard := range connectors {
			clusterName := shard.ClusterName

			// Attach allowed actions for each cluster
			var restErr *rest.Error
			shard.AllowedActions, restErr = api.Hooks.Owl.AllowedConnectClusterActions(r.Context(), clusterName)
			if restErr != nil {
				api.Logger.Error("failed to check view connect cluster permissions", zap.Error(restErr.Err))
				continue
			}
		}

		res := response{
			Clusters:     connectors,
			IsConfigured: true,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleGetClusterConnectors() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")

		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		canSee, restErr := api.Hooks.Owl.CanViewConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canSee {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to view this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to view connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		connectors, restErr := api.ConnectSvc.GetClusterConnectors(ctx, clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, connectors)
	}
}

func (api *API) handleGetClusterInfo() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")

		canSee, restErr := api.Hooks.Owl.CanViewConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canSee {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to view this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to view connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		clusterInfo, restErr := api.ConnectSvc.GetClusterInfo(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, clusterInfo)
	}
}

func (api *API) handleGetConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")
		connector := chi.URLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		canSee, restErr := api.Hooks.Owl.CanViewConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canSee {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to view this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to view connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		connectorInfo, restErr := api.ConnectSvc.GetConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, connectorInfo)
	}
}

type putConnectorConfigRequest struct {
	Config map[string]interface{} `json:"config"`
}

func (c *putConnectorConfigRequest) OK() error {
	if len(c.Config) == 0 {
		return fmt.Errorf("you must at least put one config item into the config")
	}
	return nil
}

func (c *putConnectorConfigRequest) ToClientRequest() con.PutConnectorConfigOptions {
	return con.PutConnectorConfigOptions{
		Config: c.Config,
	}
}

func (api *API) handlePutConnectorConfig() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")
		connectorName := chi.URLParam(r, "connector")

		canEdit, restErr := api.Hooks.Owl.CanEditConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canEdit {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to edit in this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to create connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		var req putConnectorConfigRequest
		restErr = rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		cInfo, restErr := api.ConnectSvc.PutConnectorConfig(r.Context(), clusterName, connectorName, req.ToClientRequest())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, cInfo)
	}
}

func (api *API) handlePutValidateConnectorConfig() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")
		pluginClassName := chi.URLParam(r, "pluginClassName")

		canEdit, restErr := api.Hooks.Owl.CanEditConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canEdit {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to edit in this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to create connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		var req map[string]interface{}
		restErr = rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		cInfo, restErr := api.ConnectSvc.ValidateConnectorConfig(r.Context(), clusterName, pluginClassName, con.ValidateConnectorConfigOptions{Config: req})
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, cInfo)
	}
}

type createConnectorRequest struct {
	ConnectorName string                 `json:"connectorName"`
	Config        map[string]interface{} `json:"config"`
}

func (c *createConnectorRequest) OK() error {
	req := c.ToClientRequest()
	return req.Validate()
}

func (c *createConnectorRequest) ToClientRequest() con.CreateConnectorRequest {
	return con.CreateConnectorRequest{
		Name:   c.ConnectorName,
		Config: c.Config,
	}
}

func (api *API) handleCreateConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")

		canEdit, restErr := api.Hooks.Owl.CanEditConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canEdit {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to edit in this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to create connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		var req createConnectorRequest
		restErr = rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		cInfo, restErr := api.ConnectSvc.CreateConnector(r.Context(), clusterName, req.ToClientRequest())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, cInfo)
	}
}

func (api *API) handleDeleteConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")
		connector := chi.URLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		canDelete, restErr := api.Hooks.Owl.CanDeleteConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canDelete {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to delete in this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to delete connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		restErr = api.ConnectSvc.DeleteConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}

func (api *API) handlePauseConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")
		connector := chi.URLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		canEdit, restErr := api.Hooks.Owl.CanEditConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canEdit {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to edit in this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to edit connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		restErr = api.ConnectSvc.PauseConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}

func (api *API) handleResumeConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")
		connector := chi.URLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		canEdit, restErr := api.Hooks.Owl.CanEditConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canEdit {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to edit in this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to edit connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		restErr = api.ConnectSvc.ResumeConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}

func (api *API) handleRestartConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")
		connector := chi.URLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		canEdit, restErr := api.Hooks.Owl.CanEditConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canEdit {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to edit in this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to edit connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		restErr = api.ConnectSvc.RestartConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}

func (api *API) handleRestartConnectorTask() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")
		connector := chi.URLParam(r, "connector")
		taskIDstr := chi.URLParam(r, "taskID")
		taskID, err := strconv.Atoi(taskIDstr)
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("failed to parse task id as number"),
				Status:   http.StatusBadRequest,
				Message:  "Invalid TaskID given. TaskID must be a number.",
				IsSilent: false,
			})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		canEdit, restErr := api.Hooks.Owl.CanEditConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canEdit {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to edit in this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to edit connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		restErr = api.ConnectSvc.RestartConnectorTask(ctx, clusterName, connector, taskID)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}
