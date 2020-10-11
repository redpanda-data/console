package owl

import (
	"fmt"
	"github.com/Shopify/sarama"
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
func (s *Service) ListAllACLs(req sarama.AclFilter) ([]*AclResource, error) {
	aclResponses, err := s.kafkaSvc.ListACLs(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get ACLs from Kafka: %w", err)
	}

	res := make([]*AclResource, len(aclResponses))
	for i, aclResponse := range aclResponses {
		overview := &AclResource{
			ResourceType:        aclResourceTypeToDisplayname(aclResponse.ResourceType),
			ResourceName:        aclResponse.ResourceName,
			ResourcePatternType: "",
			ACLs:                nil,
		}

		acls := make([]*AclRule, len(aclResponse.Acls))
		for j, acl := range aclResponse.Acls {
			acls[j] = &AclRule{
				Principal:      acl.Principal,
				Host:           acl.Host,
				Operation:      aclOperationToDisplayName(acl.Operation),
				PermissionType: aclPermissionToDisplayname(acl.PermissionType),
			}
		}
		overview.ACLs = acls
		res[i] = overview
	}
	// TODO: Maybe add sorting to ensure consistently sorted results / no flapping?

	return res, nil
}

func aclResourceTypeToDisplayname(resourceType sarama.AclResourceType) string {
	switch resourceType {
	case sarama.AclResourceUnknown:
		return "UNKNOWN"
	case sarama.AclResourceAny:
		return "ANY"
	case sarama.AclResourceTopic:
		return "TOPIC"
	case sarama.AclResourceGroup:
		return "GROUP"
	case sarama.AclResourceCluster:
		return "CLUSTER"
	case sarama.AclResourceTransactionalID:
		return "TRANSACTIONAL_ID"
	default:
		return "NOT_IDENTIFIED_IN_KOWL"
	}
}

func aclOperationToDisplayName(operation sarama.AclOperation) string {
	switch operation {
	case sarama.AclOperationUnknown:
		return "UNKNOWN"
	case sarama.AclOperationAny:
		return "ANY"
	case sarama.AclOperationAll:
		return "ALL"
	case sarama.AclOperationRead:
		return "READ"
	case sarama.AclOperationWrite:
		return "WRITE"
	case sarama.AclOperationCreate:
		return "CREATE"
	case sarama.AclOperationDelete:
		return "DELETE"
	case sarama.AclOperationAlter:
		return "ALTER"
	case sarama.AclOperationDescribe:
		return "DESCRIBE"
	case sarama.AclOperationClusterAction:
		return "CLUSTER_ACTION"
	case sarama.AclOperationDescribeConfigs:
		return "DESCRIBE_CONFIGS"
	case sarama.AclOperationAlterConfigs:
		return "ALTER_CONFIGS"
	case sarama.AclOperationIdempotentWrite:
		return "IDEMPOTENT_WRITE"
	default:
		return "NOT_IDENTIFIED_IN_KOWL"
	}
}

func aclPermissionToDisplayname(permission sarama.AclPermissionType) string {
	switch permission {
	case sarama.AclPermissionUnknown:
		return "UNKNOWN"
	case sarama.AclPermissionAny:
		return "ANY"
	case sarama.AclPermissionDeny:
		return "DENY"
	case sarama.AclPermissionAllow:
		return "ALLOW"
	default:
		return "NOT_IDENTIFIED_IN_KOWL"
	}
}
