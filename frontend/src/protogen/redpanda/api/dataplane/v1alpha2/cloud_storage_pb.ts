// @generated by protoc-gen-es v2.2.5 with parameter "target=ts"
// @generated from file redpanda/api/dataplane/v1alpha2/cloud_storage.proto (package redpanda.api.dataplane.v1alpha2, syntax proto3)
/* eslint-disable */

import type { GenEnum, GenFile, GenMessage, GenService } from "@bufbuild/protobuf/codegenv1";
import { enumDesc, fileDesc, messageDesc, serviceDesc } from "@bufbuild/protobuf/codegenv1";
import { file_buf_validate_validate } from "../../../../buf/validate/validate_pb";
import { file_google_api_annotations } from "../../../../google/api/annotations_pb";
import { file_google_api_field_behavior } from "../../../../google/api/field_behavior_pb";
import { file_protoc_gen_openapiv2_options_annotations } from "../../../../protoc-gen-openapiv2/options/annotations_pb";
import { file_redpanda_api_auth_v1_authorization } from "../../auth/v1/authorization_pb";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file redpanda/api/dataplane/v1alpha2/cloud_storage.proto.
 */
export const file_redpanda_api_dataplane_v1alpha2_cloud_storage: GenFile = /*@__PURE__*/
  fileDesc("CjNyZWRwYW5kYS9hcGkvZGF0YXBsYW5lL3YxYWxwaGEyL2Nsb3VkX3N0b3JhZ2UucHJvdG8SH3JlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjFhbHBoYTIi4QEKEk1vdW50VG9waWNzUmVxdWVzdBJhCgZ0b3BpY3MYASADKAsyPi5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxYWxwaGEyLk1vdW50VG9waWNzUmVxdWVzdC5Ub3BpY01vdW50QhHgQQK6SAvIAQGSAQUIARCACBpoCgpUb3BpY01vdW50Ei0KFnNvdXJjZV90b3BpY19yZWZlcmVuY2UYASABKAlCDeBBArpIB8gBAXICEAESKwoFYWxpYXMYAiABKAlCHLpIGXIXGPkBMhJeW2EtekEtWjAtOS5fXC1dKiQiLAoTTW91bnRUb3BpY3NSZXNwb25zZRIVCg1tb3VudF90YXNrX2lkGAEgASgFIlgKFFVubW91bnRUb3BpY3NSZXF1ZXN0EkAKBnRvcGljcxgBIAMoCUIw4EECukgqyAEBkgEkCAEQgAgYASIbchkQARj5ATISXlthLXpBLVowLTkuX1wtXSokIi4KFVVubW91bnRUb3BpY3NSZXNwb25zZRIVCg1tb3VudF90YXNrX2lkGAEgASgFIhwKGkxpc3RNb3VudGFibGVUb3BpY3NSZXF1ZXN0IrABChtMaXN0TW91bnRhYmxlVG9waWNzUmVzcG9uc2USWgoGdG9waWNzGAEgAygLMkoucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MWFscGhhMi5MaXN0TW91bnRhYmxlVG9waWNzUmVzcG9uc2UuVG9waWNMb2NhdGlvbho1Cg1Ub3BpY0xvY2F0aW9uEgwKBG5hbWUYASABKAkSFgoOdG9waWNfbG9jYXRpb24YAiABKAkiswQKCU1vdW50VGFzaxIKCgJpZBgBIAEoBRI/CgVzdGF0ZRgCIAEoDjIwLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjFhbHBoYTIuTW91bnRUYXNrLlN0YXRlEj0KBHR5cGUYAyABKA4yLy5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxYWxwaGEyLk1vdW50VGFzay5UeXBlEkAKBnRvcGljcxgEIAMoCzIwLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjFhbHBoYTIuTW91bnRUYXNrLlRvcGljGkAKBVRvcGljEhcKD3RvcGljX3JlZmVyZW5jZRgBIAEoCRIeChZzb3VyY2VfdG9waWNfcmVmZXJlbmNlGAIgASgJIj4KBFR5cGUSFAoQVFlQRV9VTlNQRUNJRklFRBAAEg4KClRZUEVfTU9VTlQQARIQCgxUWVBFX1VOTU9VTlQQAiLVAQoFU3RhdGUSFQoRU1RBVEVfVU5TUEVDSUZJRUQQABIRCg1TVEFURV9QTEFOTkVEEAESEwoPU1RBVEVfUFJFUEFSSU5HEAISEgoOU1RBVEVfUFJFUEFSRUQQAxITCg9TVEFURV9FWEVDVVRJTkcQBBISCg5TVEFURV9FWEVDVVRFRBAFEhIKDlNUQVRFX0NVVF9PVkVSEAYSEgoOU1RBVEVfRklOSVNIRUQQBxITCg9TVEFURV9DQU5DRUxJTkcQCBITCg9TVEFURV9DQU5DRUxMRUQQCSIXChVMaXN0TW91bnRUYXNrc1JlcXVlc3QiUwoWTGlzdE1vdW50VGFza3NSZXNwb25zZRI5CgV0YXNrcxgBIAMoCzIqLnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjFhbHBoYTIuTW91bnRUYXNrIiYKE0dldE1vdW50VGFza1JlcXVlc3QSDwoCaWQYASABKAVCA+BBAiJQChRHZXRNb3VudFRhc2tSZXNwb25zZRI4CgR0YXNrGAEgASgLMioucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MWFscGhhMi5Nb3VudFRhc2siKQoWRGVsZXRlTW91bnRUYXNrUmVxdWVzdBIPCgJpZBgBIAEoBUID4EECIhkKF0RlbGV0ZU1vdW50VGFza1Jlc3BvbnNlIvsBChZVcGRhdGVNb3VudFRhc2tSZXF1ZXN0Eg8KAmlkGAEgASgFQgPgQQISYAoGYWN0aW9uGAIgASgOMj4ucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MWFscGhhMi5VcGRhdGVNb3VudFRhc2tSZXF1ZXN0LkFjdGlvbkIQ4EECukgKyAEBggEEEAEgACJuCgZBY3Rpb24SFgoSQUNUSU9OX1VOU1BFQ0lGSUVEEAASEgoOQUNUSU9OX1BSRVBBUkUQARISCg5BQ1RJT05fRVhFQ1VURRACEhEKDUFDVElPTl9GSU5JU0gQAxIRCg1BQ1RJT05fQ0FOQ0VMEAQiGQoXVXBkYXRlTW91bnRUYXNrUmVzcG9uc2Uyzh4KE0Nsb3VkU3RvcmFnZVNlcnZpY2USrwQKC01vdW50VG9waWNzEjMucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MWFscGhhMi5Nb3VudFRvcGljc1JlcXVlc3QaNC5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxYWxwaGEyLk1vdW50VG9waWNzUmVzcG9uc2UitAOSQfECEiBNb3VudCB0b3BpY3MgZnJvbSBvYmplY3Qgc3RvcmFnZRrZAUF0dGFjaCBtb3VudGFibGUgdG9waWNzIGZyb20gb2JqZWN0IHN0b3JhZ2UgdG8gYSBjbHVzdGVyLCBtYWtpbmcgdGhlbSBhdmFpbGFibGUgZm9yIGNvbnN1bXB0aW9uIGFuZCBwcm9kdWN0aW9uIGFnYWluLiBNb3VudGluZyBhIHRvcGljIHJlbG9hZHMgaXRzIGRhdGEgYW5kIHN0YXRlIHRvIHRoZSBsb2NhbCBicm9rZXJzLCBhbGxvd2luZyBhY3RpdmUgdXNlIG9mIHRoZSB0b3BpYy5KRQoDMjAwEj4KAk9LEjgKNho0LnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjFhbHBoYTIuTW91bnRUb3BpY3NSZXNwb25zZUoqCgM0MDQSIwoJTm90IEZvdW5kEhYKFBoSLmdvb2dsZS5ycGMuU3RhdHVziqYdBAgDEAOC0+STAjE6BnRvcGljc2IBKiIkL3YxYWxwaGEyL2Nsb3VkLXN0b3JhZ2UvdG9waWNzL21vdW50EtkECg1Vbm1vdW50VG9waWNzEjUucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MWFscGhhMi5Vbm1vdW50VG9waWNzUmVxdWVzdBo2LnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjFhbHBoYTIuVW5tb3VudFRvcGljc1Jlc3BvbnNlItgDkkGTAxIgVW5tb3VudCB0b3BpY3MgdG8gb2JqZWN0IHN0b3JhZ2Ua+QFVbm1vdW50IHRvcGljcyB0byBvYmplY3Qgc3RvcmFnZSwgZnJlZWluZyB1cCBhbGwgbG9jYWwgY2x1c3RlciByZXNvdXJjZXMuIE9uY2UgeW91IHVubW91bnQgYSB0b3BpYywgaXQgY2FuIG5vIGxvbmdlciBiZSBjb25zdW1lZCBvciBwcm9kdWNlZCB0by4gSXQgZGV0YWNoZXMgZnJvbSB0aGUgYWN0aXZlIGNsdXN0ZXIgd2hpbGUgaXRzIGRhdGEgcmVtYWlucyBzYWZlbHkgc3RvcmVkIGluIHRoZSBleHRlcm5hbCBvYmplY3Qgc3RvcmFnZS5KRwoDMjAwEkAKAk9LEjoKOBo2LnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjFhbHBoYTIuVW5tb3VudFRvcGljc1Jlc3BvbnNlSioKAzQwNBIjCglOb3QgRm91bmQSFgoUGhIuZ29vZ2xlLnJwYy5TdGF0dXOKph0ECAMQA4LT5JMCMzoGdG9waWNzYgEqIiYvdjFhbHBoYTIvY2xvdWQtc3RvcmFnZS90b3BpY3MvdW5tb3VudBKzBAoTTGlzdE1vdW50YWJsZVRvcGljcxI7LnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjFhbHBoYTIuTGlzdE1vdW50YWJsZVRvcGljc1JlcXVlc3QaPC5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxYWxwaGEyLkxpc3RNb3VudGFibGVUb3BpY3NSZXNwb25zZSKgA5JB3AISFUxpc3QgbW91bnRhYmxlIHRvcGljcxrHAVJldHJpZXZlIGFsbCB0b3BpY3MgdGhhdCBhcmUgY3VycmVudGx5IHVubW91bnRlZCBhbmQgYXZhaWxhYmxlIHRvIGJlIG1vdW50ZWQgdG8gdGhlIGNsdXN0ZXIuIFRoZXNlIHRvcGljcyByZXNpZGUgaW4gb2JqZWN0IHN0b3JhZ2UgYW5kIGNhbiBiZSBtb3VudGVkIGZvciBjb25zdW1wdGlvbiBvciBwcm9kdWN0aW9uIHdpdGhpbiB0aGUgY2x1c3Rlci5KTQoDMjAwEkYKAk9LEkAKPho8LnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjFhbHBoYTIuTGlzdE1vdW50YWJsZVRvcGljc1Jlc3BvbnNlSioKAzQwNBIjCglOb3QgRm91bmQSFgoUGhIuZ29vZ2xlLnJwYy5TdGF0dXOKph0ECAEQA4LT5JMCMmIGdG9waWNzEigvdjFhbHBoYTIvY2xvdWQtc3RvcmFnZS90b3BpY3MvbW91bnRhYmxlEqAECg5MaXN0TW91bnRUYXNrcxI2LnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjFhbHBoYTIuTGlzdE1vdW50VGFza3NSZXF1ZXN0GjcucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MWFscGhhMi5MaXN0TW91bnRUYXNrc1Jlc3BvbnNlIpwDkkHeAhIeUmV0cmlldmUgdGhlIG1vdW50IHRhc2sgc3RhdHVzGsUBVGhpcyBvcGVyYXRpb24gcmV0cmlldmVzIHRoZSBzdGF0dXMgb2YgYSB0YXNrIHJlc3BvbnNpYmxlIGZvciBtb3VudGluZyBvciB1bm1vdW50aW5nIHRvcGljcy4gSXQgcHJvdmlkZXMgZGV0YWlscyBvbiB0aGUgdGFza+KAmXMgdHlwZSAobW91bnQgb3IgdW5tb3VudCksIGl0cyBjdXJyZW50IHN0YXRlLCBhbmQgdGhlIHRvcGljcyBpbnZvbHZlZC5KSAoDMjAwEkEKAk9LEjsKORo3LnJlZHBhbmRhLmFwaS5kYXRhcGxhbmUudjFhbHBoYTIuTGlzdE1vdW50VGFza3NSZXNwb25zZUoqCgM0MDQSIwoJTm90IEZvdW5kEhYKFBoSLmdvb2dsZS5ycGMuU3RhdHVziqYdBAgBEAOC0+STAixiBXRhc2tzEiMvdjFhbHBoYTIvY2xvdWQtc3RvcmFnZS9tb3VudC10YXNrcxL/BAoMR2V0TW91bnRUYXNrEjQucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MWFscGhhMi5HZXRNb3VudFRhc2tSZXF1ZXN0GjUucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MWFscGhhMi5HZXRNb3VudFRhc2tSZXNwb25zZSKBBJJBvwMSKkdldCB0aGUgc3RhdHVzIG9mIGEgbW91bnQgb3IgdW5tb3VudCBieSBJRBqcAlJldHJpZXZlcyB0aGUgc3RhdHVzIG9mIGEgbW91bnQgb3IgdW5tb3VudCBieSBJRC4gVGhlIHJlc3BvbnNlIHByb3ZpZGVzIGRldGFpbHMgb24gdGhlIG9wZXJhdGlvbiB0eXBlIChtb3VudCBvciB1bm1vdW50KSwgaXRzIGN1cnJlbnQgc3RhdGUsIGFuZCB0aGUgdG9waWNzIGludm9sdmVkLiBVc2UgdGhlIElEIHJldHVybmVkIHdoZW4geW91IHN0YXJ0IHRoZSBtb3VudCBvciB1bm1vdW50LCBvciB1c2UgdGhlIExpc3RNb3VudFRhc2tzIGVuZHBvaW50IHRvIHJldHJpZXZlIGEgbGlzdCBvZiBJRHMuSkYKAzIwMBI/CgJPSxI5CjcaNS5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxYWxwaGEyLkdldE1vdW50VGFza1Jlc3BvbnNlSioKAzQwNBIjCglOb3QgRm91bmQSFgoUGhIuZ29vZ2xlLnJwYy5TdGF0dXOKph0ECAEQA4LT5JMCMGIEdGFzaxIoL3YxYWxwaGEyL2Nsb3VkLXN0b3JhZ2UvbW91bnQtdGFza3Mve2lkfRL6AgoPRGVsZXRlTW91bnRUYXNrEjcucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MWFscGhhMi5EZWxldGVNb3VudFRhc2tSZXF1ZXN0GjgucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MWFscGhhMi5EZWxldGVNb3VudFRhc2tSZXNwb25zZSLzAZJBtAESGURlbGV0ZSBhIG1vdW50IG9yIHVubW91bnQaIERlbGV0ZSBhIG1vdW50IG9yIHVubW91bnQgYnkgSUQuSkkKAzIwMhJCCgJPSxI8CjoaOC5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxYWxwaGEyLkRlbGV0ZU1vdW50VGFza1Jlc3BvbnNlSioKAzQwNBIjCglOb3QgRm91bmQSFgoUGhIuZ29vZ2xlLnJwYy5TdGF0dXOKph0ECAMQA4LT5JMCLWIBKiooL3YxYWxwaGEyL2Nsb3VkLXN0b3JhZ2UvbW91bnQtdGFza3Mve2lkfRKhAwoPVXBkYXRlTW91bnRUYXNrEjcucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MWFscGhhMi5VcGRhdGVNb3VudFRhc2tSZXF1ZXN0GjgucmVkcGFuZGEuYXBpLmRhdGFwbGFuZS52MWFscGhhMi5VcGRhdGVNb3VudFRhc2tSZXNwb25zZSKaApJB2AESGVVwZGF0ZSBhIG1vdW50IG9yIHVubW91bnQaRFRoaXMgb3BlcmF0aW9uIGFsbG93cyBwZXJmb3JtaW5nIGFuIGFjdGlvbiBvbiBhbiBvbmdvaW5nIG1vdW50IHRhc2suSkkKAzIwMRJCCgJPSxI8CjoaOC5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxYWxwaGEyLlVwZGF0ZU1vdW50VGFza1Jlc3BvbnNlSioKAzQwNBIjCglOb3QgRm91bmQSFgoUGhIuZ29vZ2xlLnJwYy5TdGF0dXOKph0ECAMQA4LT5JMCMDoBKmIBKiIoL3YxYWxwaGEyL2Nsb3VkLXN0b3JhZ2UvbW91bnQtdGFza3Mve2lkfRqsAZJBqAEKGENsb3VkIFN0b3JhZ2UgKHYxYWxwaGEyKRKLAU1hbmFnZSBSZWRwYW5kYSB0b3BpY3Mgc3RvcmVkIGluIG9iamVjdCBzdG9yYWdlLiBTZWU6IFtNb3VudGFibGUgVG9waWNzXShodHRwczovL2RvY3MucmVkcGFuZGEuY29tL3JlZHBhbmRhLWNsb3VkL21hbmFnZS9tb3VudGFibGUtdG9waWNzLylCwAIKI2NvbS5yZWRwYW5kYS5hcGkuZGF0YXBsYW5lLnYxYWxwaGEyQhFDbG91ZFN0b3JhZ2VQcm90b1ABWmdnaXRodWIuY29tL3JlZHBhbmRhLWRhdGEvY29uc29sZS9iYWNrZW5kL3BrZy9wcm90b2dlbi9yZWRwYW5kYS9hcGkvZGF0YXBsYW5lL3YxYWxwaGEyO2RhdGFwbGFuZXYxYWxwaGEyogIDUkFEqgIfUmVkcGFuZGEuQXBpLkRhdGFwbGFuZS5WMWFscGhhMsoCH1JlZHBhbmRhXEFwaVxEYXRhcGxhbmVcVjFhbHBoYTLiAitSZWRwYW5kYVxBcGlcRGF0YXBsYW5lXFYxYWxwaGEyXEdQQk1ldGFkYXRh6gIiUmVkcGFuZGE6OkFwaTo6RGF0YXBsYW5lOjpWMWFscGhhMmIGcHJvdG8z", [file_buf_validate_validate, file_google_api_annotations, file_google_api_field_behavior, file_protoc_gen_openapiv2_options_annotations, file_redpanda_api_auth_v1_authorization]);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.MountTopicsRequest
 */
export type MountTopicsRequest = Message<"redpanda.api.dataplane.v1alpha2.MountTopicsRequest"> & {
  /**
   * @generated from field: repeated redpanda.api.dataplane.v1alpha2.MountTopicsRequest.TopicMount topics = 1;
   */
  topics: MountTopicsRequest_TopicMount[];
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.MountTopicsRequest.
 * Use `create(MountTopicsRequestSchema)` to create a new message.
 */
export const MountTopicsRequestSchema: GenMessage<MountTopicsRequest> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 0);

/**
 * TopicMount defines the migration of a topic from the cloud storage into this cluster,
 * so that it becomes available via the Kafka API.
 *
 * @generated from message redpanda.api.dataplane.v1alpha2.MountTopicsRequest.TopicMount
 */
export type MountTopicsRequest_TopicMount = Message<"redpanda.api.dataplane.v1alpha2.MountTopicsRequest.TopicMount"> & {
  /**
   * The topic name or full reference of the topic to mount. The full reference
   * must be used in case the same topic exists more than once. This may be the case if
   * the same topic has been unmounted multiple times. List all mountable topics to
   * find the full reference (contains topic name, cluster uuid and revision).
   *
   * @generated from field: string source_topic_reference = 1;
   */
  sourceTopicReference: string;

  /**
   * Alias may be provided to mount the topic under a different name. Leave
   * blank to re-use the source topic name. The alias does not persist if you
   * unmount the topic again.
   *
   * @generated from field: string alias = 2;
   */
  alias: string;
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.MountTopicsRequest.TopicMount.
 * Use `create(MountTopicsRequest_TopicMountSchema)` to create a new message.
 */
export const MountTopicsRequest_TopicMountSchema: GenMessage<MountTopicsRequest_TopicMount> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 0, 0);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.MountTopicsResponse
 */
export type MountTopicsResponse = Message<"redpanda.api.dataplane.v1alpha2.MountTopicsResponse"> & {
  /**
   * ID of mount
   *
   * @generated from field: int32 mount_task_id = 1;
   */
  mountTaskId: number;
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.MountTopicsResponse.
 * Use `create(MountTopicsResponseSchema)` to create a new message.
 */
export const MountTopicsResponseSchema: GenMessage<MountTopicsResponse> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 1);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.UnmountTopicsRequest
 */
export type UnmountTopicsRequest = Message<"redpanda.api.dataplane.v1alpha2.UnmountTopicsRequest"> & {
  /**
   * List of topics to unmount.
   *
   * @generated from field: repeated string topics = 1;
   */
  topics: string[];
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.UnmountTopicsRequest.
 * Use `create(UnmountTopicsRequestSchema)` to create a new message.
 */
export const UnmountTopicsRequestSchema: GenMessage<UnmountTopicsRequest> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 2);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.UnmountTopicsResponse
 */
export type UnmountTopicsResponse = Message<"redpanda.api.dataplane.v1alpha2.UnmountTopicsResponse"> & {
  /**
   * ID of unmount
   *
   * @generated from field: int32 mount_task_id = 1;
   */
  mountTaskId: number;
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.UnmountTopicsResponse.
 * Use `create(UnmountTopicsResponseSchema)` to create a new message.
 */
export const UnmountTopicsResponseSchema: GenMessage<UnmountTopicsResponse> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 3);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.ListMountableTopicsRequest
 */
export type ListMountableTopicsRequest = Message<"redpanda.api.dataplane.v1alpha2.ListMountableTopicsRequest"> & {
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.ListMountableTopicsRequest.
 * Use `create(ListMountableTopicsRequestSchema)` to create a new message.
 */
export const ListMountableTopicsRequestSchema: GenMessage<ListMountableTopicsRequest> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 4);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.ListMountableTopicsResponse
 */
export type ListMountableTopicsResponse = Message<"redpanda.api.dataplane.v1alpha2.ListMountableTopicsResponse"> & {
  /**
   * @generated from field: repeated redpanda.api.dataplane.v1alpha2.ListMountableTopicsResponse.TopicLocation topics = 1;
   */
  topics: ListMountableTopicsResponse_TopicLocation[];
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.ListMountableTopicsResponse.
 * Use `create(ListMountableTopicsResponseSchema)` to create a new message.
 */
export const ListMountableTopicsResponseSchema: GenMessage<ListMountableTopicsResponse> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 5);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.ListMountableTopicsResponse.TopicLocation
 */
export type ListMountableTopicsResponse_TopicLocation = Message<"redpanda.api.dataplane.v1alpha2.ListMountableTopicsResponse.TopicLocation"> & {
  /**
   * Topic name.
   *
   * @generated from field: string name = 1;
   */
  name: string;

  /**
   * Full reference for the unmounted topic in this format: `topic-name/cluster-uuid/revision`.
   * Use this as unique identifier for mounting a topic if there are multiple topics available
   * with the same name.
   *
   * @generated from field: string topic_location = 2;
   */
  topicLocation: string;
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.ListMountableTopicsResponse.TopicLocation.
 * Use `create(ListMountableTopicsResponse_TopicLocationSchema)` to create a new message.
 */
export const ListMountableTopicsResponse_TopicLocationSchema: GenMessage<ListMountableTopicsResponse_TopicLocation> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 5, 0);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.MountTask
 */
export type MountTask = Message<"redpanda.api.dataplane.v1alpha2.MountTask"> & {
  /**
   * Unique identifier for this mount task.
   *
   * @generated from field: int32 id = 1;
   */
  id: number;

  /**
   * State describes the current state of the mount task (e.g. "cancelled").
   *
   * @generated from field: redpanda.api.dataplane.v1alpha2.MountTask.State state = 2;
   */
  state: MountTask_State;

  /**
   * Type describes the type of this task (mount or unmount).
   *
   * @generated from field: redpanda.api.dataplane.v1alpha2.MountTask.Type type = 3;
   */
  type: MountTask_Type;

  /**
   * List of topics that are being mounted or unmounted.
   *
   * @generated from field: repeated redpanda.api.dataplane.v1alpha2.MountTask.Topic topics = 4;
   */
  topics: MountTask_Topic[];
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.MountTask.
 * Use `create(MountTaskSchema)` to create a new message.
 */
export const MountTaskSchema: GenMessage<MountTask> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 6);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.MountTask.Topic
 */
export type MountTask_Topic = Message<"redpanda.api.dataplane.v1alpha2.MountTask.Topic"> & {
  /**
   * The topic reference within the current cluster, which may be either a simple topic name or a full reference
   * in the form: cluster-uuid/topic-name/revision.
   *
   * @generated from field: string topic_reference = 1;
   */
  topicReference: string;

  /**
   * The topic reference in the object storage bucket.
   * This field is only set for tasks of type MOUNT.
   *
   * @generated from field: string source_topic_reference = 2;
   */
  sourceTopicReference: string;
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.MountTask.Topic.
 * Use `create(MountTask_TopicSchema)` to create a new message.
 */
export const MountTask_TopicSchema: GenMessage<MountTask_Topic> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 6, 0);

/**
 * @generated from enum redpanda.api.dataplane.v1alpha2.MountTask.Type
 */
export enum MountTask_Type {
  /**
   * Default value; indicates an invalid or unknown task type.
   *
   * @generated from enum value: TYPE_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * Mount represents the process of making topics available in a cluster by loading them from object storage.
   *
   * @generated from enum value: TYPE_MOUNT = 1;
   */
  MOUNT = 1,

  /**
   * Unmount represents the process of offloading topics back to object storage.
   *
   * @generated from enum value: TYPE_UNMOUNT = 2;
   */
  UNMOUNT = 2,
}

/**
 * Describes the enum redpanda.api.dataplane.v1alpha2.MountTask.Type.
 */
export const MountTask_TypeSchema: GenEnum<MountTask_Type> = /*@__PURE__*/
  enumDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 6, 0);

/**
 * @generated from enum redpanda.api.dataplane.v1alpha2.MountTask.State
 */
export enum MountTask_State {
  /**
   * Unspecified is the default value, indicating an invalid or unrecognized state.
   *
   * @generated from enum value: STATE_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * Planned: The mount task has been created and is awaiting further actions.
   *
   * @generated from enum value: STATE_PLANNED = 1;
   */
  PLANNED = 1,

  /**
   * Preparing: The mount task is gathering resources and preparing for execution.
   *
   * @generated from enum value: STATE_PREPARING = 2;
   */
  PREPARING = 2,

  /**
   * Prepared: All preparations are complete, and the mount task is ready to be executed.
   *
   * @generated from enum value: STATE_PREPARED = 3;
   */
  PREPARED = 3,

  /**
   * Executing: The mount task is actively transferring or transforming data.
   *
   * @generated from enum value: STATE_EXECUTING = 4;
   */
  EXECUTING = 4,

  /**
   * Executed: The core mount task actions are complete, but the mount task has not yet cut over or finalized.
   *
   * @generated from enum value: STATE_EXECUTED = 5;
   */
  EXECUTED = 5,

  /**
   * Cut Over: The mount task has reached a critical point where ownership is transferred or final adjustments are made.
   *
   * @generated from enum value: STATE_CUT_OVER = 6;
   */
  CUT_OVER = 6,

  /**
   * Finished: The mount task has been successfully completed, and no further actions are required.
   *
   * @generated from enum value: STATE_FINISHED = 7;
   */
  FINISHED = 7,

  /**
   * Canceling: The mount task is in the process of being canceled, and rollback or cleanup actions may be in progress.
   *
   * @generated from enum value: STATE_CANCELING = 8;
   */
  CANCELING = 8,

  /**
   * Cancelled: The mount task has been fully canceled, and no further actions will be taken.
   *
   * @generated from enum value: STATE_CANCELLED = 9;
   */
  CANCELLED = 9,
}

/**
 * Describes the enum redpanda.api.dataplane.v1alpha2.MountTask.State.
 */
export const MountTask_StateSchema: GenEnum<MountTask_State> = /*@__PURE__*/
  enumDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 6, 1);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.ListMountTasksRequest
 */
export type ListMountTasksRequest = Message<"redpanda.api.dataplane.v1alpha2.ListMountTasksRequest"> & {
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.ListMountTasksRequest.
 * Use `create(ListMountTasksRequestSchema)` to create a new message.
 */
export const ListMountTasksRequestSchema: GenMessage<ListMountTasksRequest> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 7);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.ListMountTasksResponse
 */
export type ListMountTasksResponse = Message<"redpanda.api.dataplane.v1alpha2.ListMountTasksResponse"> & {
  /**
   * @generated from field: repeated redpanda.api.dataplane.v1alpha2.MountTask tasks = 1;
   */
  tasks: MountTask[];
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.ListMountTasksResponse.
 * Use `create(ListMountTasksResponseSchema)` to create a new message.
 */
export const ListMountTasksResponseSchema: GenMessage<ListMountTasksResponse> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 8);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.GetMountTaskRequest
 */
export type GetMountTaskRequest = Message<"redpanda.api.dataplane.v1alpha2.GetMountTaskRequest"> & {
  /**
   * Unique identifier of the mount or unmount task to retrieve.
   *
   * @generated from field: int32 id = 1;
   */
  id: number;
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.GetMountTaskRequest.
 * Use `create(GetMountTaskRequestSchema)` to create a new message.
 */
export const GetMountTaskRequestSchema: GenMessage<GetMountTaskRequest> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 9);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.GetMountTaskResponse
 */
export type GetMountTaskResponse = Message<"redpanda.api.dataplane.v1alpha2.GetMountTaskResponse"> & {
  /**
   * @generated from field: redpanda.api.dataplane.v1alpha2.MountTask task = 1;
   */
  task?: MountTask;
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.GetMountTaskResponse.
 * Use `create(GetMountTaskResponseSchema)` to create a new message.
 */
export const GetMountTaskResponseSchema: GenMessage<GetMountTaskResponse> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 10);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.DeleteMountTaskRequest
 */
export type DeleteMountTaskRequest = Message<"redpanda.api.dataplane.v1alpha2.DeleteMountTaskRequest"> & {
  /**
   * Unique identifier of the mount or unmount task to delete.
   *
   * @generated from field: int32 id = 1;
   */
  id: number;
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.DeleteMountTaskRequest.
 * Use `create(DeleteMountTaskRequestSchema)` to create a new message.
 */
export const DeleteMountTaskRequestSchema: GenMessage<DeleteMountTaskRequest> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 11);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.DeleteMountTaskResponse
 */
export type DeleteMountTaskResponse = Message<"redpanda.api.dataplane.v1alpha2.DeleteMountTaskResponse"> & {
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.DeleteMountTaskResponse.
 * Use `create(DeleteMountTaskResponseSchema)` to create a new message.
 */
export const DeleteMountTaskResponseSchema: GenMessage<DeleteMountTaskResponse> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 12);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.UpdateMountTaskRequest
 */
export type UpdateMountTaskRequest = Message<"redpanda.api.dataplane.v1alpha2.UpdateMountTaskRequest"> & {
  /**
   * ID is the unique identifier of the mount or unmount to update.
   *
   * @generated from field: int32 id = 1;
   */
  id: number;

  /**
   * Action to execute on mount task.
   *
   * @generated from field: redpanda.api.dataplane.v1alpha2.UpdateMountTaskRequest.Action action = 2;
   */
  action: UpdateMountTaskRequest_Action;
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.UpdateMountTaskRequest.
 * Use `create(UpdateMountTaskRequestSchema)` to create a new message.
 */
export const UpdateMountTaskRequestSchema: GenMessage<UpdateMountTaskRequest> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 13);

/**
 * @generated from enum redpanda.api.dataplane.v1alpha2.UpdateMountTaskRequest.Action
 */
export enum UpdateMountTaskRequest_Action {
  /**
   * @generated from enum value: ACTION_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: ACTION_PREPARE = 1;
   */
  PREPARE = 1,

  /**
   * @generated from enum value: ACTION_EXECUTE = 2;
   */
  EXECUTE = 2,

  /**
   * @generated from enum value: ACTION_FINISH = 3;
   */
  FINISH = 3,

  /**
   * @generated from enum value: ACTION_CANCEL = 4;
   */
  CANCEL = 4,
}

/**
 * Describes the enum redpanda.api.dataplane.v1alpha2.UpdateMountTaskRequest.Action.
 */
export const UpdateMountTaskRequest_ActionSchema: GenEnum<UpdateMountTaskRequest_Action> = /*@__PURE__*/
  enumDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 13, 0);

/**
 * @generated from message redpanda.api.dataplane.v1alpha2.UpdateMountTaskResponse
 */
export type UpdateMountTaskResponse = Message<"redpanda.api.dataplane.v1alpha2.UpdateMountTaskResponse"> & {
};

/**
 * Describes the message redpanda.api.dataplane.v1alpha2.UpdateMountTaskResponse.
 * Use `create(UpdateMountTaskResponseSchema)` to create a new message.
 */
export const UpdateMountTaskResponseSchema: GenMessage<UpdateMountTaskResponse> = /*@__PURE__*/
  messageDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 14);

/**
 * CloudStorageService implements endpoints for mounting and unmounting topics in Redpanda clusters.
 * Requires that you have tiered storage enabled.
 *
 * @generated from service redpanda.api.dataplane.v1alpha2.CloudStorageService
 */
export const CloudStorageService: GenService<{
  /**
   * @generated from rpc redpanda.api.dataplane.v1alpha2.CloudStorageService.MountTopics
   */
  mountTopics: {
    methodKind: "unary";
    input: typeof MountTopicsRequestSchema;
    output: typeof MountTopicsResponseSchema;
  },
  /**
   * @generated from rpc redpanda.api.dataplane.v1alpha2.CloudStorageService.UnmountTopics
   */
  unmountTopics: {
    methodKind: "unary";
    input: typeof UnmountTopicsRequestSchema;
    output: typeof UnmountTopicsResponseSchema;
  },
  /**
   * @generated from rpc redpanda.api.dataplane.v1alpha2.CloudStorageService.ListMountableTopics
   */
  listMountableTopics: {
    methodKind: "unary";
    input: typeof ListMountableTopicsRequestSchema;
    output: typeof ListMountableTopicsResponseSchema;
  },
  /**
   * @generated from rpc redpanda.api.dataplane.v1alpha2.CloudStorageService.ListMountTasks
   */
  listMountTasks: {
    methodKind: "unary";
    input: typeof ListMountTasksRequestSchema;
    output: typeof ListMountTasksResponseSchema;
  },
  /**
   * @generated from rpc redpanda.api.dataplane.v1alpha2.CloudStorageService.GetMountTask
   */
  getMountTask: {
    methodKind: "unary";
    input: typeof GetMountTaskRequestSchema;
    output: typeof GetMountTaskResponseSchema;
  },
  /**
   * @generated from rpc redpanda.api.dataplane.v1alpha2.CloudStorageService.DeleteMountTask
   */
  deleteMountTask: {
    methodKind: "unary";
    input: typeof DeleteMountTaskRequestSchema;
    output: typeof DeleteMountTaskResponseSchema;
  },
  /**
   * @generated from rpc redpanda.api.dataplane.v1alpha2.CloudStorageService.UpdateMountTask
   */
  updateMountTask: {
    methodKind: "unary";
    input: typeof UpdateMountTaskRequestSchema;
    output: typeof UpdateMountTaskResponseSchema;
  },
}> = /*@__PURE__*/
  serviceDesc(file_redpanda_api_dataplane_v1alpha2_cloud_storage, 0);

