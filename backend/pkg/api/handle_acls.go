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
	"fmt"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/gorilla/schema"
	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/console"
)

type getAclsOverviewRequest struct {
	// The resource type.
	ResourceType kmsg.ACLResourceType `schema:"resourceType"`

	// The resource name, or null to match any resource name.
	ResourceName *string `schema:"resourceName"`

	// The resource pattern to match.
	ResourcePatternTypeFilter kmsg.ACLResourcePatternType `schema:"resourcePatternTypeFilter"`

	// The principal to match, or null to match any principal.
	Principal *string `schema:"principal"`

	// The host to match, or null to match any host.
	Host *string `schema:"host"`

	// The operation to match.
	Operation kmsg.ACLOperation `schema:"operation"`

	// The permission type to match.
	PermissionType kmsg.ACLPermissionType `schema:"permissionType"`
}

// ToKafkaRequest returns a request struct that complies with the expected request object for the Kafka library
func (g *getAclsOverviewRequest) ToKafkaRequest() kmsg.DescribeACLsRequest {
	return kmsg.DescribeACLsRequest{
		ResourceType:        g.ResourceType,
		ResourceName:        g.ResourceName,
		ResourcePatternType: g.ResourcePatternTypeFilter,
		Principal:           g.Principal,
		Host:                g.Host,
		Operation:           g.Operation,
		PermissionType:      g.PermissionType,
	}
}

func (api *API) handleGetACLsOverview() http.HandlerFunc {
	// response represents the data which is returned for listing ACLs
	type response struct {
		*console.ACLOverview
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// Parse request from url parameters
		decoder := schema.NewDecoder()
		req := &getAclsOverviewRequest{}
		err := decoder.Decode(req, r.URL.Query())
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusBadRequest,
				Message:  fmt.Sprintf("Failed to parse request parameters: %v", err.Error()),
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		aclOverview, err := api.ConsoleSvc.ListAllACLs(r.Context(), req.ToKafkaRequest())
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  fmt.Sprintf("Could not list ACLs: %v", err.Error()),
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		res := response{
			aclOverview,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}
