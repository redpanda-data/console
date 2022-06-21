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

	"github.com/gorilla/schema"
	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/cloudhut/common/rest"
	"github.com/redpanda-data/console/backend/pkg/console"
)

type getAclsOverviewRequest struct {
	// The resource type.
	ResourceType int8 `schema:"resourceType"`

	// The resource name, or null to match any resource name.
	ResourceName *string `schema:"resourceName"`

	// The resource pattern to match.
	ResourcePatternTypeFilter int `schema:"resourcePatternTypeFilter"`

	// The principal to match, or null to match any principal.
	Principal *string `schema:"principal"`

	// The host to match, or null to match any host.
	Host *string `schema:"host"`

	// The operation to match.
	Operation int `schema:"operation"`

	// The permission type to match.
	PermissionType int `schema:"permissionType"`
}

func (g *getAclsOverviewRequest) OK() error {
	if kmsg.ACLResourceType(g.ResourceType).String() == kmsg.ACLResourceTypeUnknown.String() {
		return fmt.Errorf("resourceType filter is out of bounds")
	}

	if kmsg.ACLResourcePatternType(g.ResourcePatternTypeFilter).String() == kmsg.ACLResourcePatternTypeUnknown.String() {
		return fmt.Errorf("resourcePatternTypeFilter is out of bounds")
	}

	if kmsg.ACLOperation(g.Operation).String() == kmsg.ACLOperationUnknown.String() {
		return fmt.Errorf("operation filter is out of bounds")
	}

	if kmsg.ACLPermissionType(g.PermissionType).String() == kmsg.ACLPermissionTypeUnknown.String() {
		return fmt.Errorf("permission type filter is out of bounds")
	}

	return nil
}

// ToKafkaRequest returns a request struct that complies with the expected request object for the Kafka library
func (g *getAclsOverviewRequest) ToKafkaRequest() kmsg.DescribeACLsRequest {
	return kmsg.DescribeACLsRequest{
		ResourceType:        kmsg.ACLResourceType(g.ResourceType),
		ResourceName:        g.ResourceName,
		ResourcePatternType: kmsg.ACLResourcePatternType(g.ResourcePatternTypeFilter),
		Principal:           g.Principal,
		Host:                g.Host,
		Operation:           kmsg.ACLOperation(g.Operation),
		PermissionType:      kmsg.ACLPermissionType(g.PermissionType),
	}
}

func (api *API) handleGetACLsOverview() http.HandlerFunc {
	// response represents the data which is returned for listing ACLs
	type response struct {
		*console.AclOverview
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
				Message:  "Failed to parse request parameters",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// Validate parsed request
		err = req.OK()
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusBadRequest,
				Message:  fmt.Sprintf("Failed to validate request parameters: %v", err.Error()),
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// Check if logged in user is allowed to list ACLs
		isAllowed, restErr := api.Hooks.Console.CanListACLs(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !isAllowed {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("requester is not allowed to list ACLs"),
				Status:   http.StatusForbidden,
				Message:  "You are not allowed to list ACLs",
				IsSilent: true,
			})
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

type deleteAclsRequest struct {
	// The resource type.
	ResourceType int8 `schema:"resourceType"`

	// The resource name, or null to match any resource name.
	ResourceName *string `schema:"resourceName"`

	// The resource pattern to match.
	ResourcePatternType int `schema:"resourcePatternType"`

	// The principal to match, or null to match any principal.
	Principal *string `schema:"principal"`

	// The host to match, or null to match any host.
	Host *string `schema:"host"`

	// The operation to match.
	Operation int `schema:"operation"`

	// The permission type to match.
	PermissionType int `schema:"permissionType"`
}

func (g *deleteAclsRequest) OK() error {
	if kmsg.ACLResourceType(g.ResourceType).String() == kmsg.ACLResourceTypeUnknown.String() {
		return fmt.Errorf("resourceType filter is out of bounds")
	}

	if kmsg.ACLResourcePatternType(g.ResourcePatternType).String() == kmsg.ACLResourcePatternTypeUnknown.String() {
		return fmt.Errorf("resourcePatternTypeFilter is out of bounds")
	}

	if kmsg.ACLOperation(g.Operation).String() == kmsg.ACLOperationUnknown.String() {
		return fmt.Errorf("operation filter is out of bounds")
	}

	if kmsg.ACLPermissionType(g.PermissionType).String() == kmsg.ACLPermissionTypeUnknown.String() {
		return fmt.Errorf("permission type filter is out of bounds")
	}

	return nil
}

// ToKafkaRequest returns a request struct that complies with the expected request object for the Kafka library
func (g *deleteAclsRequest) ToKafkaRequest() kmsg.DeleteACLsRequestFilter {
	reqFilter := kmsg.NewDeleteACLsRequestFilter()
	reqFilter.PermissionType = kmsg.ACLPermissionType(g.PermissionType)
	reqFilter.Operation = kmsg.ACLOperation(g.Operation)
	reqFilter.Host = g.Host
	reqFilter.Principal = g.Principal
	reqFilter.ResourcePatternType = kmsg.ACLResourcePatternType(g.ResourcePatternType)
	reqFilter.ResourceName = g.ResourceName
	reqFilter.ResourceType = kmsg.ACLResourceType(g.ResourceType)

	return reqFilter
}

func (api *API) handleDeleteACLs() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Parse request from url parameters
		decoder := schema.NewDecoder()
		req := &deleteAclsRequest{}
		err := decoder.Decode(req, r.URL.Query())
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusBadRequest,
				Message:  "Failed to parse request parameters",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// Validate parsed request
		err = req.OK()
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusBadRequest,
				Message:  fmt.Sprintf("Failed to validate request parameters: %v", err.Error()),
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// Check if logged-in user is allowed to delete ACLs
		isAllowed, restErr := api.Hooks.Console.CanDeleteACL(r.Context(), req.Principal)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !isAllowed {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("requester is not allowed to delete ACLs"),
				Status:   http.StatusForbidden,
				Message:  "You are not allowed to delete ACLs",
				IsSilent: true,
			})
			return
		}

		aclDeleteRes, restErr := api.ConsoleSvc.DeleteACLs(r.Context(), req.ToKafkaRequest())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, aclDeleteRes)
	}
}

type CreateACLRequest struct {
	// ResourceType is the type of resource this acl entry will be on.
	// It is invalid to use UNKNOWN or ANY.
	ResourceType int8 `schema:"resourceType"`

	// ResourceName is the name of the resource this acl entry will be on.
	// For CLUSTER, this must be "kafka-cluster".
	ResourceName string `schema:"resourceName"`

	// ResourcePatternType is the pattern type to use for the resource name.
	// This cannot be UNKNOWN or MATCH (i.e. this must be LITERAL or PREFIXED).
	// The default for pre-Kafka 2.0.0 is effectively LITERAL.
	//
	// This field has a default of 3.
	ResourcePatternType int `schema:"resourcePatternType"`

	// Principal is the user to apply this acl for. With the Kafka simple
	// authorizer, this must begin with "User:".
	Principal string `schema:"principal"`

	// Host is the host address to use for this acl. Each host to allow
	// the principal access from must be specified as a new creation. KIP-252
	// might solve this someday. The special wildcard host "*" allows all hosts.
	Host string `schema:"host"`

	// Operation is the operation this acl is for. This must not be UNKNOWN or
	// ANY.
	Operation int `schema:"operation"`

	// PermissionType is the permission of this acl. This must be either ALLOW
	// or DENY.
	PermissionType int `schema:"permissionType"`
}

func (c *CreateACLRequest) OK() error {
	// ACL resource type must not be UNKNOWN (0) or ANY (1)
	switch kmsg.ACLResourceType(c.ResourceType).String() {
	case kmsg.ACLResourceTypeAny.String(), kmsg.ACLResourceTypeUnknown.String():
		return fmt.Errorf("acl resource type must not be any (1) or unknown (0), but found: %q", kmsg.ACLResourceType(c.ResourceType).String())
	}

	// Resource pattern type must be LITERAL (3) or PREFIXED (4)
	switch kmsg.ACLResourcePatternType(c.ResourcePatternType) {
	case kmsg.ACLResourcePatternTypeLiteral, kmsg.ACLResourcePatternTypePrefixed:
	default:
		return fmt.Errorf("resourcePatternType is invalid, must be either LITERAL (3) or PREFIXED (4)")
	}

	// Operation must not be Unknown (0) or Any (1)
	switch kmsg.ACLOperation(c.Operation).String() {
	case kmsg.ACLOperationUnknown.String():
		return fmt.Errorf("operation filter is out of bounds")
	case kmsg.ACLOperationAny.String():
		return fmt.Errorf("operation type any (1) is not allowed for creating a new ACL")
	}

	// Permission type must be either 'deny' (2) or 'any' (1)
	switch kmsg.ACLPermissionType(c.PermissionType) {
	case kmsg.ACLPermissionTypeDeny, kmsg.ACLPermissionTypeAllow:
	default:
		return fmt.Errorf("given permission type is invalid, it must be either allow (3) or deny (2)")
	}

	return nil
}

// ToKafkaRequest returns a request struct that complies with the expected request object for the Kafka library
func (c *CreateACLRequest) ToKafkaRequest() kmsg.CreateACLsRequestCreation {
	reqFilter := kmsg.NewCreateACLsRequestCreation()
	reqFilter.PermissionType = kmsg.ACLPermissionType(c.PermissionType)
	reqFilter.Operation = kmsg.ACLOperation(c.Operation)
	reqFilter.Host = c.Host
	reqFilter.Principal = c.Principal
	reqFilter.ResourcePatternType = kmsg.ACLResourcePatternType(c.ResourcePatternType)
	reqFilter.ResourceName = c.ResourceName
	reqFilter.ResourceType = kmsg.ACLResourceType(c.ResourceType)

	return reqFilter
}

func (api *API) handleCreateACL() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Parse request from url parameters & validate it as part of Decode()
		var req CreateACLRequest
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// Check if logged-in user is allowed to create ACLs
		isAllowed, restErr := api.Hooks.Console.CanCreateACL(r.Context(), req.Principal)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !isAllowed {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("requester is not allowed to create ACLs for the given principal"),
				Status:   http.StatusForbidden,
				Message:  "You are not allowed to create ACLs for the given principal name",
				IsSilent: true,
			})
			return
		}

		restErr = api.ConsoleSvc.CreateACL(r.Context(), req.ToKafkaRequest())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}
