package owl

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

type AclOverview struct {
	AclResources        []*AclResource `json:"aclResources"`
	IsAuthorizerEnabled bool           `json:"isAuthorizerEnabled"`
}

// AclResource is all information we get when listing ACLs
type AclResource struct {
	ResourceType        string     `json:"resourceType"`
	ResourceName        string     `json:"resourceName"`
	ResourcePatternType string     `json:"resourcePatternType"`
	ACLs                []*AclRule `json:"acls"`
}

type AclRule struct {
	Principal      string `json:"principal"`
	Host           string `json:"host"`
	Operation      string `json:"operation"`
	PermissionType string `json:"permissionType"`
}

// ListAllACLs returns a list of all stored ACLs.
func (s *Service) ListAllACLs(ctx context.Context, req kmsg.DescribeACLsRequest) (*AclOverview, error) {
	aclResponses, err := s.kafkaSvc.ListACLs(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to get ACLs from Kafka: %w", err)
	}

	kafkaErr := kerr.TypedErrorForCode(aclResponses.ErrorCode)
	if kafkaErr != nil {
		if kafkaErr == kerr.SecurityDisabled {
			return &AclOverview{
				AclResources:        nil,
				IsAuthorizerEnabled: false,
			}, nil
		}
		return nil, fmt.Errorf("failed to get ACLs from Kafka: %v", kafkaErr.Error())
	}

	resources := make([]*AclResource, len(aclResponses.Resources))
	for i, aclResponse := range aclResponses.Resources {
		overview := &AclResource{
			ResourceType:        aclResponse.ResourceType.String(),
			ResourceName:        aclResponse.ResourceName,
			ResourcePatternType: "",
			ACLs:                nil,
		}

		acls := make([]*AclRule, len(aclResponse.ACLs))
		for j, acl := range aclResponse.ACLs {
			acls[j] = &AclRule{
				Principal:      acl.Principal,
				Host:           acl.Host,
				Operation:      acl.Operation.String(),
				PermissionType: acl.PermissionType.String(),
			}
		}
		overview.ACLs = acls
		resources[i] = overview
	}

	return &AclOverview{
		AclResources:        resources,
		IsAuthorizerEnabled: true,
	}, nil
}
