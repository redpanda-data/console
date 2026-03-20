// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"

	"github.com/redpanda-data/console/backend/pkg/console"
)

// handleGetUsers returns a list of Kafka users via the Kafka SCRAM API.
func (api *API) handleGetUsers() http.HandlerFunc {
	type response struct {
		Users      []string `json:"users"`
		IsComplete bool     `json:"isComplete"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		described, err := api.ConsoleSvc.DescribeUserSCRAMCredentials(r.Context())
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:     err,
				Status:  http.StatusServiceUnavailable,
				Message: fmt.Sprintf("Failed to list users: %v", err.Error()),
			})
			return
		}

		users := make([]string, 0, len(described))
		for _, user := range described.Sorted() {
			if user.Err != nil {
				continue
			}
			users = append(users, user.User)
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, &response{
			Users:      users,
			IsComplete: true,
		})
	}
}

// CreateUserRequest is the schema for the request body when creating a new user.
type CreateUserRequest struct {
	Username  string `json:"username"`
	Password  string `json:"password"`
	Mechanism string `json:"mechanism"`
}

// OK validates the create user request.
func (c *CreateUserRequest) OK() error {
	if c.Username == "" {
		return errors.New("username must be set")
	}
	if c.Password == "" {
		return errors.New("password must be set")
	}

	switch c.Mechanism {
	case "SCRAM-SHA-256", "SCRAM-SHA-512":
	default:
		return errors.New("mechanism must be either SCRAM-SHA-256 or SCRAM-SHA-512")
	}

	return nil
}

func mechanismStringToKadm(mechanism string) kadm.ScramMechanism {
	switch mechanism {
	case "SCRAM-SHA-256":
		return kadm.ScramSha256
	case "SCRAM-SHA-512":
		return kadm.ScramSha512
	default:
		return 0
	}
}

func (api *API) handleCreateUser() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req CreateUserRequest
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		mechanism := mechanismStringToKadm(req.Mechanism)

		results, err := api.ConsoleSvc.AlterUserSCRAMs(r.Context(), nil, []kadm.UpsertSCRAM{{
			User:       req.Username,
			Mechanism:  mechanism,
			Iterations: console.DefaultSCRAMIterations,
			Password:   req.Password,
		}})
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:     err,
				Status:  http.StatusServiceUnavailable,
				Message: fmt.Sprintf("Failed to create user: %v", err.Error()),
			})
			return
		}

		if result, ok := results[req.Username]; ok && result.Err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:     result.Err,
				Status:  http.StatusServiceUnavailable,
				Message: fmt.Sprintf("Failed to create user: %v", result.Err.Error()),
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}

func (api *API) handleDeleteUser() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principalID := rest.GetURLParam(r, "principalID")
		if principalID == "" {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:     errors.New("user must be set"),
				Status:  http.StatusBadRequest,
				Message: "User must be set",
			})
			return
		}

		described, err := api.ConsoleSvc.DescribeUserSCRAMCredentials(r.Context(), principalID)
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:     err,
				Status:  http.StatusServiceUnavailable,
				Message: fmt.Sprintf("Failed to describe user: %v", err.Error()),
			})
			return
		}

		userSCRAM, ok := described[principalID]
		switch {
		case !ok || errors.Is(userSCRAM.Err, kerr.ResourceNotFound):
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:     errors.New("user not found"),
				Status:  http.StatusNotFound,
				Message: "User not found",
			})
			return
		case userSCRAM.Err != nil:
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:     userSCRAM.Err,
				Status:  http.StatusServiceUnavailable,
				Message: fmt.Sprintf("Failed to describe user: %v", userSCRAM.Err.Error()),
			})
			return
		case len(userSCRAM.CredInfos) == 0:
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:     errors.New("user has no SCRAM credentials"),
				Status:  http.StatusNotFound,
				Message: "User has no SCRAM credentials",
			})
			return
		}

		deletions := make([]kadm.DeleteSCRAM, 0, len(userSCRAM.CredInfos))
		for _, cred := range userSCRAM.CredInfos {
			deletions = append(deletions, kadm.DeleteSCRAM{
				User:      principalID,
				Mechanism: cred.Mechanism,
			})
		}

		results, err := api.ConsoleSvc.AlterUserSCRAMs(r.Context(), deletions, nil)
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:     err,
				Status:  http.StatusServiceUnavailable,
				Message: fmt.Sprintf("Failed to delete user: %v", err.Error()),
			})
			return
		}

		if result, ok := results[principalID]; ok && result.Err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:     result.Err,
				Status:  http.StatusServiceUnavailable,
				Message: fmt.Sprintf("Failed to delete user: %v", result.Err.Error()),
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}
