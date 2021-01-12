package owl

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kmsg"
)

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
func (s *Service) ListAllACLs(ctx context.Context, req kmsg.DescribeACLsRequest) ([]*AclResource, error) {
	aclResponses, err := s.kafkaSvc.ListACLs(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to get ACLs from Kafka: %w", err)
	}

	res := make([]*AclResource, len(aclResponses.Resources))
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
		res[i] = overview
	}
	// TODO: Maybe add sorting to ensure consistently sorted results / no flapping?

	return res, nil
}
