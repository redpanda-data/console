import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
} from '../../../../protogen/redpanda/api/dataplane/v1/acl_pb';
import { SASLMechanism } from '../../../../protogen/redpanda/api/dataplane/v1/user_pb';
import type { saslMechanisms } from '../types/forms';

export const saslMechanismToProto = (mechanism: (typeof saslMechanisms)[number]): SASLMechanism => {
  const mapping: Record<(typeof saslMechanisms)[number], SASLMechanism> = {
    'SCRAM-SHA-256': SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
    'SCRAM-SHA-512': SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512,
  };
  return mapping[mechanism];
};

export const createTopicSuperuserACLs = (topicName: string, username: string) => {
  const operations = [
    ACL_Operation.ALL,
    ACL_Operation.READ,
    ACL_Operation.WRITE,
    ACL_Operation.CREATE,
    ACL_Operation.DELETE,
    ACL_Operation.DESCRIBE,
    ACL_Operation.DESCRIBE_CONFIGS,
    ACL_Operation.ALTER,
    ACL_Operation.ALTER_CONFIGS,
  ];

  return operations.map((operation) => ({
    resourceType: ACL_ResourceType.TOPIC,
    resourceName: topicName,
    resourcePatternType: ACL_ResourcePatternType.LITERAL,
    principal: `User:${username}`,
    host: '*',
    operation,
    permissionType: ACL_PermissionType.ALLOW,
  }));
};
