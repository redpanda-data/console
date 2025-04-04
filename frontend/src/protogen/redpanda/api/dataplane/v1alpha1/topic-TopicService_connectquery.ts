// @generated by protoc-gen-connect-query v1.4.0 with parameter "target=ts,import_extension=,js_import_style=legacy_commonjs"
// @generated from file redpanda/api/dataplane/v1alpha1/topic.proto (package redpanda.api.dataplane.v1alpha1, syntax proto3)
/* eslint-disable */
// @ts-nocheck

import { MethodKind } from "@bufbuild/protobuf";
import { CreateTopicRequest, CreateTopicResponse, DeleteTopicRequest, DeleteTopicResponse, GetTopicConfigurationsRequest, GetTopicConfigurationsResponse, ListTopicsRequest, ListTopicsResponse, SetTopicConfigurationsRequest, SetTopicConfigurationsResponse, UpdateTopicConfigurationsRequest, UpdateTopicConfigurationsResponse } from "./topic_pb";

/**
 * @generated from rpc redpanda.api.dataplane.v1alpha1.TopicService.CreateTopic
 * @deprecated
 */
export const createTopic = {
  localName: "createTopic",
  name: "CreateTopic",
  kind: MethodKind.Unary,
  I: CreateTopicRequest,
  O: CreateTopicResponse,
  service: {
    typeName: "redpanda.api.dataplane.v1alpha1.TopicService"
  }
} as const;

/**
 * @generated from rpc redpanda.api.dataplane.v1alpha1.TopicService.ListTopics
 * @deprecated
 */
export const listTopics = {
  localName: "listTopics",
  name: "ListTopics",
  kind: MethodKind.Unary,
  I: ListTopicsRequest,
  O: ListTopicsResponse,
  service: {
    typeName: "redpanda.api.dataplane.v1alpha1.TopicService"
  }
} as const;

/**
 * @generated from rpc redpanda.api.dataplane.v1alpha1.TopicService.DeleteTopic
 * @deprecated
 */
export const deleteTopic = {
  localName: "deleteTopic",
  name: "DeleteTopic",
  kind: MethodKind.Unary,
  I: DeleteTopicRequest,
  O: DeleteTopicResponse,
  service: {
    typeName: "redpanda.api.dataplane.v1alpha1.TopicService"
  }
} as const;

/**
 * @generated from rpc redpanda.api.dataplane.v1alpha1.TopicService.GetTopicConfigurations
 * @deprecated
 */
export const getTopicConfigurations = {
  localName: "getTopicConfigurations",
  name: "GetTopicConfigurations",
  kind: MethodKind.Unary,
  I: GetTopicConfigurationsRequest,
  O: GetTopicConfigurationsResponse,
  service: {
    typeName: "redpanda.api.dataplane.v1alpha1.TopicService"
  }
} as const;

/**
 * @generated from rpc redpanda.api.dataplane.v1alpha1.TopicService.UpdateTopicConfigurations
 * @deprecated
 */
export const updateTopicConfigurations = {
  localName: "updateTopicConfigurations",
  name: "UpdateTopicConfigurations",
  kind: MethodKind.Unary,
  I: UpdateTopicConfigurationsRequest,
  O: UpdateTopicConfigurationsResponse,
  service: {
    typeName: "redpanda.api.dataplane.v1alpha1.TopicService"
  }
} as const;

/**
 * @generated from rpc redpanda.api.dataplane.v1alpha1.TopicService.SetTopicConfigurations
 * @deprecated
 */
export const setTopicConfigurations = {
  localName: "setTopicConfigurations",
  name: "SetTopicConfigurations",
  kind: MethodKind.Unary,
  I: SetTopicConfigurationsRequest,
  O: SetTopicConfigurationsResponse,
  service: {
    typeName: "redpanda.api.dataplane.v1alpha1.TopicService"
  }
} as const;
