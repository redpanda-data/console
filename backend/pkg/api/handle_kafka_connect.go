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
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/cloudhut/common/rest"
	con "github.com/cloudhut/connect-client"

	"github.com/redpanda-data/console/backend/pkg/connect"
)

func (api *API) handleGetConnectors() http.HandlerFunc {
	type response struct {
		IsConfigured bool                         `json:"isConfigured"`
		Clusters     []*connect.ClusterConnectors `json:"clusters"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), api.ConnectSvc.Cfg.RequestTimeout)
		defer cancel()

		connectors, err := api.ConnectSvc.GetAllClusterConnectors(ctx)
		if err != nil {
			if errors.Is(err, connect.ErrKafkaConnectNotConfigured) {
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

		res := response{
			Clusters:     connectors,
			IsConfigured: true,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleGetClusterConnectors() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := rest.GetURLParam(r, "clusterName")

		ctx, cancel := context.WithTimeout(r.Context(), api.ConnectSvc.Cfg.RequestTimeout)
		defer cancel()

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
		clusterName := rest.GetURLParam(r, "clusterName")

		clusterInfo, restErr := api.ConnectSvc.GetClusterInfo(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		clusterFeatures := api.Hooks.Console.EnabledConnectClusterFeatures(r.Context(), clusterName)
		clusterInfo.EnabledFeatures = append(clusterInfo.EnabledFeatures, clusterFeatures...)

		rest.SendResponse(w, r, api.Logger, http.StatusOK, clusterInfo)
	}
}

func (api *API) handleGetConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := rest.GetURLParam(r, "clusterName")
		connector := rest.GetURLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), api.ConnectSvc.Cfg.RequestTimeout)
		defer cancel()

		connectorInfo, restErr := api.ConnectSvc.GetConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, connectorInfo)
	}
}

type putConnectorConfigRequest struct {
	Config map[string]any `json:"config"`
}

func (c *putConnectorConfigRequest) OK() error {
	if len(c.Config) == 0 {
		return errors.New("you must at least put one config item into the config")
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
		clusterName := rest.GetURLParam(r, "clusterName")
		connectorName := rest.GetURLParam(r, "connector")

		var req putConnectorConfigRequest

		cInfo, restErr := api.ConnectSvc.PutConnectorConfig(r.Context(), clusterName, connectorName, req.ToClientRequest())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// restart the instance and all the tasks
		restErr = api.ConnectSvc.RestartConnector(r.Context(), clusterName, connectorName, true, false)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, cInfo)
	}
}

func (api *API) handlePutValidateConnectorConfig() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := rest.GetURLParam(r, "clusterName")
		pluginClassName := rest.GetURLParam(r, "pluginClassName")

		var req map[string]any
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		cInfo, restErr := api.ConnectSvc.ValidateConnectorConfig(r.Context(), clusterName, pluginClassName, req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, cInfo)
	}
}

type createConnectorRequest struct {
	ConnectorName string         `json:"connectorName"`
	Config        map[string]any `json:"config"`
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
		clusterName := rest.GetURLParam(r, "clusterName")

		var req createConnectorRequest
		restErr := rest.Decode(w, r, &req)
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
		clusterName := rest.GetURLParam(r, "clusterName")
		connector := rest.GetURLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), api.ConnectSvc.Cfg.RequestTimeout)
		defer cancel()

		restErr := api.ConnectSvc.DeleteConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}

func (api *API) handlePauseConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := rest.GetURLParam(r, "clusterName")
		connector := rest.GetURLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), api.ConnectSvc.Cfg.RequestTimeout)
		defer cancel()

		restErr := api.ConnectSvc.PauseConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}

func (api *API) handleResumeConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := rest.GetURLParam(r, "clusterName")
		connector := rest.GetURLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), api.ConnectSvc.Cfg.RequestTimeout)
		defer cancel()

		restErr := api.ConnectSvc.ResumeConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}

func (api *API) handleRestartConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := rest.GetURLParam(r, "clusterName")
		connector := rest.GetURLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), api.ConnectSvc.Cfg.RequestTimeout)
		defer cancel()

		restErr := api.ConnectSvc.RestartConnector(ctx, clusterName, connector, true, false)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}

func (api *API) handleRestartConnectorTask() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := rest.GetURLParam(r, "clusterName")
		connector := rest.GetURLParam(r, "connector")
		taskIDstr := rest.GetURLParam(r, "taskID")
		taskID, err := strconv.Atoi(taskIDstr)
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      errors.New("failed to parse task id as number"),
				Status:   http.StatusBadRequest,
				Message:  "Invalid TaskID given. TaskID must be a number.",
				IsSilent: false,
			})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), api.ConnectSvc.Cfg.RequestTimeout)
		defer cancel()

		restErr := api.ConnectSvc.RestartConnectorTask(ctx, clusterName, connector, taskID)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}
