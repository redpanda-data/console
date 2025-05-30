// @generated by protoc-gen-es v2.2.5 with parameter "target=ts"
// @generated from file redpanda/api/dataplane/v1/acl.proto (package redpanda.api.dataplane.v1, syntax proto3)
/* eslint-disable */

import type { GenEnum, GenFile, GenMessage, GenService } from "@bufbuild/protobuf/codegenv1";
import { enumDesc, fileDesc, messageDesc, serviceDesc } from "@bufbuild/protobuf/codegenv1";
import { file_buf_validate_validate } from "../../../../buf/validate/validate_pb";
import { file_google_api_annotations } from "../../../../google/api/annotations_pb";
import { file_google_api_field_behavior } from "../../../../google/api/field_behavior_pb";
import type { Status } from "../../../../google/rpc/status_pb";
import { file_google_rpc_status } from "../../../../google/rpc/status_pb";
import { file_protoc_gen_openapiv2_options_annotations } from "../../../../protoc-gen-openapiv2/options/annotations_pb";
import { file_redpanda_api_auth_v1_authorization } from "../../auth/v1/authorization_pb";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file redpanda/api/dataplane/v1/acl.proto.
 */
export const file_redpanda_api_dataplane_v1_acl: GenFile = /*@__PURE__*/
  fileDesc("CiNyZWRwYW5kYS9hcGkvZGF0YXBsYW5lL3YxL2FjbC5wcm90bxIZcmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MSLIBwoDQUNMIvEBCgxSZXNvdXJjZVR5cGUSHQoZUkVTT1VSQ0VfVFlQRV9VTlNQRUNJRklFRBAAEhUKEVJFU09VUkNFX1RZUEVfQU5ZEAESFwoTUkVTT1VSQ0VfVFlQRV9UT1BJQxACEhcKE1JFU09VUkNFX1RZUEVfR1JPVVAQAxIZChVSRVNPVVJDRV9UWVBFX0NMVVNURVIQBBIiCh5SRVNPVVJDRV9UWVBFX1RSQU5TQUNUSU9OQUxfSUQQBRIiCh5SRVNPVVJDRV9UWVBFX0RFTEVHQVRJT05fVE9LRU4QBhIWChJSRVNPVVJDRV9UWVBFX1VTRVIQByLDAQoTUmVzb3VyY2VQYXR0ZXJuVHlwZRIlCiFSRVNPVVJDRV9QQVRURVJOX1RZUEVfVU5TUEVDSUZJRUQQABIdChlSRVNPVVJDRV9QQVRURVJOX1RZUEVfQU5ZEAESHwobUkVTT1VSQ0VfUEFUVEVSTl9UWVBFX01BVENIEAISIQodUkVTT1VSQ0VfUEFUVEVSTl9UWVBFX0xJVEVSQUwQAxIiCh5SRVNPVVJDRV9QQVRURVJOX1RZUEVfUFJFRklYRUQQBCKFAwoJT3BlcmF0aW9uEhkKFU9QRVJBVElPTl9VTlNQRUNJRklFRBAAEhEKDU9QRVJBVElPTl9BTlkQARIRCg1PUEVSQVRJT05fQUxMEAISEgoOT1BFUkFUSU9OX1JFQUQQAxITCg9PUEVSQVRJT05fV1JJVEUQBBIUChBPUEVSQVRJT05fQ1JFQVRFEAUSFAoQT1BFUkFUSU9OX0RFTEVURRAGEhMKD09QRVJBVElPTl9BTFRFUhAHEhYKEk9QRVJBVElPTl9ERVNDUklCRRAIEhwKGE9QRVJBVElPTl9DTFVTVEVSX0FDVElPThAJEh4KGk9QRVJBVElPTl9ERVNDUklCRV9DT05GSUdTEAoSGwoXT1BFUkFUSU9OX0FMVEVSX0NPTkZJR1MQCxIeChpPUEVSQVRJT05fSURFTVBPVEVOVF9XUklURRAMEhsKF09QRVJBVElPTl9DUkVBVEVfVE9LRU5TEA0SHQoZT1BFUkFUSU9OX0RFU0NSSUJFX1RPS0VOUxAOIn8KDlBlcm1pc3Npb25UeXBlEh8KG1BFUk1JU1NJT05fVFlQRV9VTlNQRUNJRklFRBAAEhcKE1BFUk1JU1NJT05fVFlQRV9BTlkQARIYChRQRVJNSVNTSU9OX1RZUEVfREVOWRACEhkKFVBFUk1JU1NJT05fVFlQRV9BTExPVxADIpMECg9MaXN0QUNMc1JlcXVlc3QSQQoGZmlsdGVyGAEgASgLMjEucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MS5MaXN0QUNMc1JlcXVlc3QuRmlsdGVyGrwDCgZGaWx0ZXISTAoNcmVzb3VyY2VfdHlwZRgBIAEoDjIrLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuQUNMLlJlc291cmNlVHlwZUIIukgFggECEAESGgoNcmVzb3VyY2VfbmFtZRgCIAEoCUgAiAEBElsKFXJlc291cmNlX3BhdHRlcm5fdHlwZRgDIAEoDjIyLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuQUNMLlJlc291cmNlUGF0dGVyblR5cGVCCLpIBYIBAhABEhYKCXByaW5jaXBhbBgEIAEoCUgBiAEBEhEKBGhvc3QYBSABKAlIAogBARJFCglvcGVyYXRpb24YBiABKA4yKC5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxLkFDTC5PcGVyYXRpb25CCLpIBYIBAhABElAKD3Blcm1pc3Npb25fdHlwZRgHIAEoDjItLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuQUNMLlBlcm1pc3Npb25UeXBlQgi6SAWCAQIQAUIQCg5fcmVzb3VyY2VfbmFtZUIMCgpfcHJpbmNpcGFsQgcKBV9ob3N0IokEChBMaXN0QUNMc1Jlc3BvbnNlEkcKCXJlc291cmNlcxgBIAMoCzI0LnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuTGlzdEFDTHNSZXNwb25zZS5SZXNvdXJjZRquAQoGUG9saWN5EhEKCXByaW5jaXBhbBgBIAEoCRIMCgRob3N0GAIgASgJEjsKCW9wZXJhdGlvbhgDIAEoDjIoLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuQUNMLk9wZXJhdGlvbhJGCg9wZXJtaXNzaW9uX3R5cGUYBCABKA4yLS5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxLkFDTC5QZXJtaXNzaW9uVHlwZRr6AQoIUmVzb3VyY2USQgoNcmVzb3VyY2VfdHlwZRgBIAEoDjIrLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuQUNMLlJlc291cmNlVHlwZRIVCg1yZXNvdXJjZV9uYW1lGAIgASgJElEKFXJlc291cmNlX3BhdHRlcm5fdHlwZRgDIAEoDjIyLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuQUNMLlJlc291cmNlUGF0dGVyblR5cGUSQAoEYWNscxgEIAMoCzIyLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuTGlzdEFDTHNSZXNwb25zZS5Qb2xpY3ki3gcKEENyZWF0ZUFDTFJlcXVlc3QSVgoNcmVzb3VyY2VfdHlwZRgBIAEoDjIrLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuQUNMLlJlc291cmNlVHlwZUIS4EECukgMyAEBggEGEAEgACABEhUKDXJlc291cmNlX25hbWUYAiABKAkSZQoVcmVzb3VyY2VfcGF0dGVybl90eXBlGAMgASgOMjIucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MS5BQ0wuUmVzb3VyY2VQYXR0ZXJuVHlwZUIS4EECukgMyAEBggEGEAEYAxgEEiUKCXByaW5jaXBhbBgEIAEoCUIS4EECukgMyAEBcgc6BVVzZXI6EpQBCgRob3N0GAUgASgJQoUB4EECukh/ugF5ChZ3aWxkY2FyZF9vcl9pcF9hZGRyZXNzEj1GaWVsZCBob3N0IG11c3QgYmUgZWl0aGVyIHdpbGRjYXJkICgqKSBvciBhIHZhbGlkIElQIGFkZHJlc3MuGiB0aGlzID09ICcqJyA/IHRydWUgOiB0aGlzLmlzSXAoKcgBARJPCglvcGVyYXRpb24YBiABKA4yKC5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxLkFDTC5PcGVyYXRpb25CEuBBArpIDMgBAYIBBhABIAAgARJaCg9wZXJtaXNzaW9uX3R5cGUYByABKA4yLS5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxLkFDTC5QZXJtaXNzaW9uVHlwZUIS4EECukgMyAEBggEGEAEYAhgDOogDukiEAxqBAwo6cmVzb3VyY2VfbmFtZV9tdXN0X2JlX3NldF9leGNlcHRfZm9yX2NsdXN0ZXJfcmVzb3VyY2VfdHlwZRrCAnRoaXMucmVzb3VyY2VfdHlwZSA9PSA0ICYmIHNpemUodGhpcy5yZXNvdXJjZV9uYW1lKSA9PSAwID8gJyc6IHRoaXMucmVzb3VyY2VfdHlwZSA9PSA0ICYmIHRoaXMucmVzb3VyY2VfbmFtZSAhPSAna2Fma2EtY2x1c3RlcicgPyAnRmllbGQgcmVzb3VyY2VfbmFtZSBtdXN0IGJlIHNldCB0byAia2Fma2EtY2x1c3RlciIgb3IgZW1wdHkgd2hlbiB1c2luZyByZXNvdXJjZV90eXBlPUNMVVNURVInOiB0aGlzLnJlc291cmNlX3R5cGUgIT0gNCAmJiBzaXplKHRoaXMucmVzb3VyY2VfbmFtZSkgPT0gMCA/ICdGaWVsZCByZXNvdXJjZV9uYW1lIG11c3QgYmUgc2V0JzogJyciEwoRQ3JlYXRlQUNMUmVzcG9uc2UiwgQKEURlbGV0ZUFDTHNSZXF1ZXN0Ek4KBmZpbHRlchgBIAEoCzIzLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuRGVsZXRlQUNMc1JlcXVlc3QuRmlsdGVyQgngQQK6SAPIAQEa3AMKBkZpbHRlchJUCg1yZXNvdXJjZV90eXBlGAEgASgOMisucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MS5BQ0wuUmVzb3VyY2VUeXBlQhDgQQK6SArIAQGCAQQQASAAEhoKDXJlc291cmNlX25hbWUYAiABKAlIAIgBARJjChVyZXNvdXJjZV9wYXR0ZXJuX3R5cGUYAyABKA4yMi5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxLkFDTC5SZXNvdXJjZVBhdHRlcm5UeXBlQhDgQQK6SArIAQGCAQQQASAAEhYKCXByaW5jaXBhbBgEIAEoCUgBiAEBEhEKBGhvc3QYBSABKAlIAogBARJNCglvcGVyYXRpb24YBiABKA4yKC5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxLkFDTC5PcGVyYXRpb25CEOBBArpICsgBAYIBBBABIAASWAoPcGVybWlzc2lvbl90eXBlGAcgASgOMi0ucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MS5BQ0wuUGVybWlzc2lvblR5cGVCEOBBArpICsgBAYIBBBABIABCEAoOX3Jlc291cmNlX25hbWVCDAoKX3ByaW5jaXBhbEIHCgVfaG9zdCLtAwoSRGVsZXRlQUNMc1Jlc3BvbnNlElAKDW1hdGNoaW5nX2FjbHMYASADKAsyOS5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxLkRlbGV0ZUFDTHNSZXNwb25zZS5NYXRjaGluZ0FDTBqEAwoLTWF0Y2hpbmdBQ0wSQgoNcmVzb3VyY2VfdHlwZRgBIAEoDjIrLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuQUNMLlJlc291cmNlVHlwZRIVCg1yZXNvdXJjZV9uYW1lGAIgASgJElEKFXJlc291cmNlX3BhdHRlcm5fdHlwZRgDIAEoDjIyLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuQUNMLlJlc291cmNlUGF0dGVyblR5cGUSEQoJcHJpbmNpcGFsGAQgASgJEgwKBGhvc3QYBSABKAkSOwoJb3BlcmF0aW9uGAYgASgOMigucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MS5BQ0wuT3BlcmF0aW9uEkYKD3Blcm1pc3Npb25fdHlwZRgHIAEoDjItLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuQUNMLlBlcm1pc3Npb25UeXBlEiEKBWVycm9yGAggASgLMhIuZ29vZ2xlLnJwYy5TdGF0dXMy7wgKCkFDTFNlcnZpY2USuAIKCExpc3RBQ0xzEioucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MS5MaXN0QUNMc1JlcXVlc3QaKy5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxLkxpc3RBQ0xzUmVzcG9uc2Ui0gGSQbYBEglMaXN0IEFDTHMaa0xpc3QgYWxsIEFDTHMuIFRoZSBgZmlsdGVyLmAgcXVlcnkgc3RyaW5nIHBhcmFtZXRlcnMgZmluZCBtYXRjaGluZyBBQ0xzIHRoYXQgbWVldCBhbGwgc3BlY2lmaWVkIGNvbmRpdGlvbnMuSjwKAzIwMBI1CgJPSxIvCi0aKy5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxLkxpc3RBQ0xzUmVzcG9uc2WKph0ECAEQAYLT5JMCChIIL3YxL2FjbHMS6gEKCUNyZWF0ZUFDTBIrLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuQ3JlYXRlQUNMUmVxdWVzdBosLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuQ3JlYXRlQUNMUmVzcG9uc2UigQGSQWMSCkNyZWF0ZSBBQ0waEUNyZWF0ZSBhIG5ldyBBQ0wuSkIKAzIwMRI7CgdDcmVhdGVkEjAKLhosLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjEuQ3JlYXRlQUNMUmVzcG9uc2WKph0ECAMQAYLT5JMCDToBKiIIL3YxL2FjbHMS5AIKCkRlbGV0ZUFDTHMSLC5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxLkRlbGV0ZUFDTHNSZXF1ZXN0Gi0ucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MS5EZWxldGVBQ0xzUmVzcG9uc2Ui+AGSQdwBEgtEZWxldGUgQUNMcxqMAURlbGV0ZSBhbGwgQUNMcyB0aGF0IG1hdGNoIHRoZSBmaWx0ZXIgY3JpdGVyaWEuIFRoZSBgZmlsdGVyLmAgcXVlcnkgc3RyaW5nIHBhcmFtZXRlcnMgZmluZCBtYXRjaGluZyBBQ0xzIHRoYXQgbWVldCBhbGwgc3BlY2lmaWVkIGNvbmRpdGlvbnMuSj4KAzIwMBI3CgJPSxIxCi8aLS5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxLkRlbGV0ZUFDTHNSZXNwb25zZYqmHQQIAxABgtPkkwIKKggvdjEvYWNscxrRAZJBzQEKDVJlZHBhbmRhIEFDTHMSuwFNYW5hZ2UgUmVkcGFuZGEgYWNjZXNzIGNvbnRyb2wgbGlzdHMgKEFDTHMpLiBTZWUgW1JlZHBhbmRhIENsb3VkIEF1dGhvcml6YXRpb25dKGh0dHBzOi8vZG9jcy5yZWRwYW5kYS5jb20vcmVkcGFuZGEtY2xvdWQvc2VjdXJpdHkvYXV0aG9yaXphdGlvbi9jbG91ZC1hdXRob3JpemF0aW9uLykgZm9yIG1vcmUgaW5mb3JtYXRpb24uQo0CCh1jb20ucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MUIIQWNsUHJvdG9QAVpbZ2l0aHViLmNvbS9yZWRwYW5kYS1kYXRhL2NvbnNvbGUvYmFja2VuZC9wa2cvcHJvdG9nZW4vcmVkcGFuZGEvYXBpL2RhdGFwbGFuZS92MTtkYXRhcGxhbmV2MaICA1JBRKoCGVJlZHBhbmRhLkFwaS5EYXRhcGxhbmUuVjHKAhlSZWRwYW5kYVxBcGlcRGF0YXBsYW5lXFYx4gIlUmVkcGFuZGFcQXBpXERhdGFwbGFuZVxWMVxHUEJNZXRhZGF0YeoCHFJlZHBhbmRhOjpBcGk6OkRhdGFwbGFuZTo6VjFiBnByb3RvMw", [file_buf_validate_validate, file_google_api_annotations, file_google_api_field_behavior, file_google_rpc_status, file_protoc_gen_openapiv2_options_annotations, file_redpanda_api_auth_v1_authorization]);

/**
 * @generated from message redpanda.api.dataplane.v1.ACL
 */
export type ACL = Message<"redpanda.api.dataplane.v1.ACL"> & {
};

/**
 * Describes the message redpanda.api.dataplane.v1.ACL.
 * Use `create(ACLSchema)` to create a new message.
 */
export const ACLSchema: GenMessage<ACL> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1_acl, 0);

/**
 * The type of resource (topic, consumer group, etc.) this
 * ACL targets.
 *
 * @generated from enum redpanda.api.dataplane.v1.ACL.ResourceType
 */
export enum ACL_ResourceType {
  /**
   * @generated from enum value: RESOURCE_TYPE_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: RESOURCE_TYPE_ANY = 1;
   */
  ANY = 1,

  /**
   * @generated from enum value: RESOURCE_TYPE_TOPIC = 2;
   */
  TOPIC = 2,

  /**
   * @generated from enum value: RESOURCE_TYPE_GROUP = 3;
   */
  GROUP = 3,

  /**
   * @generated from enum value: RESOURCE_TYPE_CLUSTER = 4;
   */
  CLUSTER = 4,

  /**
   * @generated from enum value: RESOURCE_TYPE_TRANSACTIONAL_ID = 5;
   */
  TRANSACTIONAL_ID = 5,

  /**
   * @generated from enum value: RESOURCE_TYPE_DELEGATION_TOKEN = 6;
   */
  DELEGATION_TOKEN = 6,

  /**
   * @generated from enum value: RESOURCE_TYPE_USER = 7;
   */
  USER = 7,
}

/**
 * Describes the enum redpanda.api.dataplane.v1.ACL.ResourceType.
 */
export const ACL_ResourceTypeSchema: GenEnum<ACL_ResourceType> = /*@__PURE__*/
  enumDesc(file_redpanda_api_dataplane_v1_acl, 0, 0);

/**
 * The pattern to use for matching the specified resource_name
 * (any, exact match, literal, or prefixed).
 *
 * @generated from enum redpanda.api.dataplane.v1.ACL.ResourcePatternType
 */
export enum ACL_ResourcePatternType {
  /**
   * @generated from enum value: RESOURCE_PATTERN_TYPE_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: RESOURCE_PATTERN_TYPE_ANY = 1;
   */
  ANY = 1,

  /**
   * @generated from enum value: RESOURCE_PATTERN_TYPE_MATCH = 2;
   */
  MATCH = 2,

  /**
   * @generated from enum value: RESOURCE_PATTERN_TYPE_LITERAL = 3;
   */
  LITERAL = 3,

  /**
   * @generated from enum value: RESOURCE_PATTERN_TYPE_PREFIXED = 4;
   */
  PREFIXED = 4,
}

/**
 * Describes the enum redpanda.api.dataplane.v1.ACL.ResourcePatternType.
 */
export const ACL_ResourcePatternTypeSchema: GenEnum<ACL_ResourcePatternType> = /*@__PURE__*/
  enumDesc(file_redpanda_api_dataplane_v1_acl, 0, 1);

/**
 * The operation that is allowed or denied (e.g. READ).
 *
 * @generated from enum redpanda.api.dataplane.v1.ACL.Operation
 */
export enum ACL_Operation {
  /**
   * @generated from enum value: OPERATION_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: OPERATION_ANY = 1;
   */
  ANY = 1,

  /**
   * @generated from enum value: OPERATION_ALL = 2;
   */
  ALL = 2,

  /**
   * @generated from enum value: OPERATION_READ = 3;
   */
  READ = 3,

  /**
   * @generated from enum value: OPERATION_WRITE = 4;
   */
  WRITE = 4,

  /**
   * @generated from enum value: OPERATION_CREATE = 5;
   */
  CREATE = 5,

  /**
   * @generated from enum value: OPERATION_DELETE = 6;
   */
  DELETE = 6,

  /**
   * @generated from enum value: OPERATION_ALTER = 7;
   */
  ALTER = 7,

  /**
   * @generated from enum value: OPERATION_DESCRIBE = 8;
   */
  DESCRIBE = 8,

  /**
   * @generated from enum value: OPERATION_CLUSTER_ACTION = 9;
   */
  CLUSTER_ACTION = 9,

  /**
   * @generated from enum value: OPERATION_DESCRIBE_CONFIGS = 10;
   */
  DESCRIBE_CONFIGS = 10,

  /**
   * @generated from enum value: OPERATION_ALTER_CONFIGS = 11;
   */
  ALTER_CONFIGS = 11,

  /**
   * @generated from enum value: OPERATION_IDEMPOTENT_WRITE = 12;
   */
  IDEMPOTENT_WRITE = 12,

  /**
   * @generated from enum value: OPERATION_CREATE_TOKENS = 13;
   */
  CREATE_TOKENS = 13,

  /**
   * @generated from enum value: OPERATION_DESCRIBE_TOKENS = 14;
   */
  DESCRIBE_TOKENS = 14,
}

/**
 * Describes the enum redpanda.api.dataplane.v1.ACL.Operation.
 */
export const ACL_OperationSchema: GenEnum<ACL_Operation> = /*@__PURE__*/
  enumDesc(file_redpanda_api_dataplane_v1_acl, 0, 2);

/**
 * Whether the operation should be allowed or denied.
 *
 * @generated from enum redpanda.api.dataplane.v1.ACL.PermissionType
 */
export enum ACL_PermissionType {
  /**
   * @generated from enum value: PERMISSION_TYPE_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: PERMISSION_TYPE_ANY = 1;
   */
  ANY = 1,

  /**
   * @generated from enum value: PERMISSION_TYPE_DENY = 2;
   */
  DENY = 2,

  /**
   * @generated from enum value: PERMISSION_TYPE_ALLOW = 3;
   */
  ALLOW = 3,
}

/**
 * Describes the enum redpanda.api.dataplane.v1.ACL.PermissionType.
 */
export const ACL_PermissionTypeSchema: GenEnum<ACL_PermissionType> = /*@__PURE__*/
  enumDesc(file_redpanda_api_dataplane_v1_acl, 0, 3);

/**
 * @generated from message redpanda.api.dataplane.v1.ListACLsRequest
 */
export type ListACLsRequest = Message<"redpanda.api.dataplane.v1.ListACLsRequest"> & {
  /**
   * @generated from field: redpanda.api.dataplane.v1.ListACLsRequest.Filter filter = 1;
   */
  filter?: ListACLsRequest_Filter;
};

/**
 * Describes the message redpanda.api.dataplane.v1.ListACLsRequest.
 * Use `create(ListACLsRequestSchema)` to create a new message.
 */
export const ListACLsRequestSchema: GenMessage<ListACLsRequest> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1_acl, 1);

/**
 * @generated from message redpanda.api.dataplane.v1.ListACLsRequest.Filter
 */
export type ListACLsRequest_Filter = Message<"redpanda.api.dataplane.v1.ListACLsRequest.Filter"> & {
  /**
   * The type of resource (topic, consumer group, etc.) this
   * ACL targets.
   *
   * @generated from field: redpanda.api.dataplane.v1.ACL.ResourceType resource_type = 1;
   */
  resourceType: ACL_ResourceType;

  /**
   * The name of the resource this ACL targets.
   *
   * @generated from field: optional string resource_name = 2;
   */
  resourceName?: string;

  /**
   * The pattern to use for matching the specified resource_name
   * (any, exact match, literal, or prefixed).
   *
   * @generated from field: redpanda.api.dataplane.v1.ACL.ResourcePatternType resource_pattern_type = 3;
   */
  resourcePatternType: ACL_ResourcePatternType;

  /**
   * The user for whom this ACL applies. With the Kafka simple
   * authorizer, you must include the prefix "User:" with the user name.
   *
   * @generated from field: optional string principal = 4;
   */
  principal?: string;

  /**
   * The host address to use for this ACL. To allow a principal
   * access from multiple hosts, you must create an ACL for each host.
   *
   * @generated from field: optional string host = 5;
   */
  host?: string;

  /**
   * The operation that is allowed or denied (e.g. READ).
   *
   * @generated from field: redpanda.api.dataplane.v1.ACL.Operation operation = 6;
   */
  operation: ACL_Operation;

  /**
   * Whether the operation should be allowed or denied.
   *
   * @generated from field: redpanda.api.dataplane.v1.ACL.PermissionType permission_type = 7;
   */
  permissionType: ACL_PermissionType;
};

/**
 * Describes the message redpanda.api.dataplane.v1.ListACLsRequest.Filter.
 * Use `create(ListACLsRequest_FilterSchema)` to create a new message.
 */
export const ListACLsRequest_FilterSchema: GenMessage<ListACLsRequest_Filter> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1_acl, 1, 0);

/**
 * @generated from message redpanda.api.dataplane.v1.ListACLsResponse
 */
export type ListACLsResponse = Message<"redpanda.api.dataplane.v1.ListACLsResponse"> & {
  /**
   * @generated from field: repeated redpanda.api.dataplane.v1.ListACLsResponse.Resource resources = 1;
   */
  resources: ListACLsResponse_Resource[];
};

/**
 * Describes the message redpanda.api.dataplane.v1.ListACLsResponse.
 * Use `create(ListACLsResponseSchema)` to create a new message.
 */
export const ListACLsResponseSchema: GenMessage<ListACLsResponse> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1_acl, 2);

/**
 * @generated from message redpanda.api.dataplane.v1.ListACLsResponse.Policy
 */
export type ListACLsResponse_Policy = Message<"redpanda.api.dataplane.v1.ListACLsResponse.Policy"> & {
  /**
   * The user for whom this ACL applies.
   *
   * @generated from field: string principal = 1;
   */
  principal: string;

  /**
   * The host address for this ACL.
   *
   * @generated from field: string host = 2;
   */
  host: string;

  /**
   * @generated from field: redpanda.api.dataplane.v1.ACL.Operation operation = 3;
   */
  operation: ACL_Operation;

  /**
   * @generated from field: redpanda.api.dataplane.v1.ACL.PermissionType permission_type = 4;
   */
  permissionType: ACL_PermissionType;
};

/**
 * Describes the message redpanda.api.dataplane.v1.ListACLsResponse.Policy.
 * Use `create(ListACLsResponse_PolicySchema)` to create a new message.
 */
export const ListACLsResponse_PolicySchema: GenMessage<ListACLsResponse_Policy> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1_acl, 2, 0);

/**
 * @generated from message redpanda.api.dataplane.v1.ListACLsResponse.Resource
 */
export type ListACLsResponse_Resource = Message<"redpanda.api.dataplane.v1.ListACLsResponse.Resource"> & {
  /**
   * @generated from field: redpanda.api.dataplane.v1.ACL.ResourceType resource_type = 1;
   */
  resourceType: ACL_ResourceType;

  /**
   * The name of the resource this ACL targets.
   *
   * @generated from field: string resource_name = 2;
   */
  resourceName: string;

  /**
   * @generated from field: redpanda.api.dataplane.v1.ACL.ResourcePatternType resource_pattern_type = 3;
   */
  resourcePatternType: ACL_ResourcePatternType;

  /**
   * @generated from field: repeated redpanda.api.dataplane.v1.ListACLsResponse.Policy acls = 4;
   */
  acls: ListACLsResponse_Policy[];
};

/**
 * Describes the message redpanda.api.dataplane.v1.ListACLsResponse.Resource.
 * Use `create(ListACLsResponse_ResourceSchema)` to create a new message.
 */
export const ListACLsResponse_ResourceSchema: GenMessage<ListACLsResponse_Resource> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1_acl, 2, 1);

/**
 * @generated from message redpanda.api.dataplane.v1.CreateACLRequest
 */
export type CreateACLRequest = Message<"redpanda.api.dataplane.v1.CreateACLRequest"> & {
  /**
   * @generated from field: redpanda.api.dataplane.v1.ACL.ResourceType resource_type = 1;
   */
  resourceType: ACL_ResourceType;

  /**
   * The name of the resource this ACL targets.
   * For requests with resource_type CLUSTER, this will default to "kafka-cluster".
   *
   * @generated from field: string resource_name = 2;
   */
  resourceName: string;

  /**
   * @generated from field: redpanda.api.dataplane.v1.ACL.ResourcePatternType resource_pattern_type = 3;
   */
  resourcePatternType: ACL_ResourcePatternType;

  /**
   * The user for whom this ACL applies. With the Kafka simple
   * authorizer, you must include the prefix "User:" with the user name.
   *
   * @generated from field: string principal = 4;
   */
  principal: string;

  /**
   * The host address to use for this ACL. To allow a principal
   * access from multiple hosts, you must create an ACL for each host.
   *
   * @generated from field: string host = 5;
   */
  host: string;

  /**
   * @generated from field: redpanda.api.dataplane.v1.ACL.Operation operation = 6;
   */
  operation: ACL_Operation;

  /**
   * @generated from field: redpanda.api.dataplane.v1.ACL.PermissionType permission_type = 7;
   */
  permissionType: ACL_PermissionType;
};

/**
 * Describes the message redpanda.api.dataplane.v1.CreateACLRequest.
 * Use `create(CreateACLRequestSchema)` to create a new message.
 */
export const CreateACLRequestSchema: GenMessage<CreateACLRequest> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1_acl, 3);

/**
 * @generated from message redpanda.api.dataplane.v1.CreateACLResponse
 */
export type CreateACLResponse = Message<"redpanda.api.dataplane.v1.CreateACLResponse"> & {
};

/**
 * Describes the message redpanda.api.dataplane.v1.CreateACLResponse.
 * Use `create(CreateACLResponseSchema)` to create a new message.
 */
export const CreateACLResponseSchema: GenMessage<CreateACLResponse> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1_acl, 4);

/**
 * @generated from message redpanda.api.dataplane.v1.DeleteACLsRequest
 */
export type DeleteACLsRequest = Message<"redpanda.api.dataplane.v1.DeleteACLsRequest"> & {
  /**
   * @generated from field: redpanda.api.dataplane.v1.DeleteACLsRequest.Filter filter = 1;
   */
  filter?: DeleteACLsRequest_Filter;
};

/**
 * Describes the message redpanda.api.dataplane.v1.DeleteACLsRequest.
 * Use `create(DeleteACLsRequestSchema)` to create a new message.
 */
export const DeleteACLsRequestSchema: GenMessage<DeleteACLsRequest> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1_acl, 5);

/**
 * @generated from message redpanda.api.dataplane.v1.DeleteACLsRequest.Filter
 */
export type DeleteACLsRequest_Filter = Message<"redpanda.api.dataplane.v1.DeleteACLsRequest.Filter"> & {
  /**
   * The type of resource (topic, consumer group, etc.) this
   * ACL targets.
   *
   * @generated from field: redpanda.api.dataplane.v1.ACL.ResourceType resource_type = 1;
   */
  resourceType: ACL_ResourceType;

  /**
   * The name of the resource this ACL targets.
   *
   * @generated from field: optional string resource_name = 2;
   */
  resourceName?: string;

  /**
   * The pattern to use for matching the specified resource_name
   * (any, exact match, literal, or prefixed).
   *
   * @generated from field: redpanda.api.dataplane.v1.ACL.ResourcePatternType resource_pattern_type = 3;
   */
  resourcePatternType: ACL_ResourcePatternType;

  /**
   * The user for whom this ACL applies. With the Kafka simple
   * authorizer, you must include the prefix "User:" with the user name.
   *
   * @generated from field: optional string principal = 4;
   */
  principal?: string;

  /**
   * The host address to use for this ACL. To allow a principal
   * access from multiple hosts, you must create an ACL for each host.
   *
   * @generated from field: optional string host = 5;
   */
  host?: string;

  /**
   * The operation that is allowed or denied (e.g. READ).
   *
   * @generated from field: redpanda.api.dataplane.v1.ACL.Operation operation = 6;
   */
  operation: ACL_Operation;

  /**
   * Whether the operation should be allowed or denied.
   *
   * @generated from field: redpanda.api.dataplane.v1.ACL.PermissionType permission_type = 7;
   */
  permissionType: ACL_PermissionType;
};

/**
 * Describes the message redpanda.api.dataplane.v1.DeleteACLsRequest.Filter.
 * Use `create(DeleteACLsRequest_FilterSchema)` to create a new message.
 */
export const DeleteACLsRequest_FilterSchema: GenMessage<DeleteACLsRequest_Filter> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1_acl, 5, 0);

/**
 * @generated from message redpanda.api.dataplane.v1.DeleteACLsResponse
 */
export type DeleteACLsResponse = Message<"redpanda.api.dataplane.v1.DeleteACLsResponse"> & {
  /**
   * @generated from field: repeated redpanda.api.dataplane.v1.DeleteACLsResponse.MatchingACL matching_acls = 1;
   */
  matchingAcls: DeleteACLsResponse_MatchingACL[];
};

/**
 * Describes the message redpanda.api.dataplane.v1.DeleteACLsResponse.
 * Use `create(DeleteACLsResponseSchema)` to create a new message.
 */
export const DeleteACLsResponseSchema: GenMessage<DeleteACLsResponse> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1_acl, 6);

/**
 * @generated from message redpanda.api.dataplane.v1.DeleteACLsResponse.MatchingACL
 */
export type DeleteACLsResponse_MatchingACL = Message<"redpanda.api.dataplane.v1.DeleteACLsResponse.MatchingACL"> & {
  /**
   * @generated from field: redpanda.api.dataplane.v1.ACL.ResourceType resource_type = 1;
   */
  resourceType: ACL_ResourceType;

  /**
   * The name of the resource this ACL targets.
   *
   * @generated from field: string resource_name = 2;
   */
  resourceName: string;

  /**
   * @generated from field: redpanda.api.dataplane.v1.ACL.ResourcePatternType resource_pattern_type = 3;
   */
  resourcePatternType: ACL_ResourcePatternType;

  /**
   * The user for whom this ACL applies.
   *
   * @generated from field: string principal = 4;
   */
  principal: string;

  /**
   * The host address to use for this ACL.
   *
   * @generated from field: string host = 5;
   */
  host: string;

  /**
   * @generated from field: redpanda.api.dataplane.v1.ACL.Operation operation = 6;
   */
  operation: ACL_Operation;

  /**
   * @generated from field: redpanda.api.dataplane.v1.ACL.PermissionType permission_type = 7;
   */
  permissionType: ACL_PermissionType;

  /**
   * @generated from field: google.rpc.Status error = 8;
   */
  error?: Status;
};

/**
 * Describes the message redpanda.api.dataplane.v1.DeleteACLsResponse.MatchingACL.
 * Use `create(DeleteACLsResponse_MatchingACLSchema)` to create a new message.
 */
export const DeleteACLsResponse_MatchingACLSchema: GenMessage<DeleteACLsResponse_MatchingACL> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1_acl, 6, 0);

/**
 * @generated from service redpanda.api.dataplane.v1.ACLService
 */
export const ACLService: GenService<{
  /**
   * @generated from rpc redpanda.api.dataplane.v1.ACLService.ListACLs
   */
  listACLs: {
    methodKind: "unary";
    input: typeof ListACLsRequestSchema;
    output: typeof ListACLsResponseSchema;
  },
  /**
   * @generated from rpc redpanda.api.dataplane.v1.ACLService.CreateACL
   */
  createACL: {
    methodKind: "unary";
    input: typeof CreateACLRequestSchema;
    output: typeof CreateACLResponseSchema;
  },
  /**
   * @generated from rpc redpanda.api.dataplane.v1.ACLService.DeleteACLs
   */
  deleteACLs: {
    methodKind: "unary";
    input: typeof DeleteACLsRequestSchema;
    output: typeof DeleteACLsResponseSchema;
  },
}> = /*@__PURE__*/
  serviceDesc(file_redpanda_api_dataplane_v1_acl, 0);

