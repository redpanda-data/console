// @generated by protoc-gen-es v1.6.0 with parameter "target=ts,import_extension="
// @generated from file redpanda/api/console/v1alpha1/pipeline.proto (package redpanda.api.console.v1alpha1, syntax proto3)
/* eslint-disable */
// @ts-nocheck

import type { BinaryReadOptions, FieldList, JsonReadOptions, JsonValue, PartialMessage, PlainMessage } from "@bufbuild/protobuf";
import { Message, proto3 } from "@bufbuild/protobuf";
import { CreatePipelineRequest as CreatePipelineRequest$1, CreatePipelineResponse as CreatePipelineResponse$1, DeletePipelineRequest as DeletePipelineRequest$1, DeletePipelineResponse as DeletePipelineResponse$1, GetPipelineRequest as GetPipelineRequest$1, GetPipelineResponse as GetPipelineResponse$1, GetPipelinesBySecretsRequest as GetPipelinesBySecretsRequest$1, GetPipelinesBySecretsResponse as GetPipelinesBySecretsResponse$1, GetPipelineServiceConfigSchemaRequest as GetPipelineServiceConfigSchemaRequest$1, GetPipelineServiceConfigSchemaResponse as GetPipelineServiceConfigSchemaResponse$1, GetPipelinesForSecretRequest as GetPipelinesForSecretRequest$1, GetPipelinesForSecretResponse as GetPipelinesForSecretResponse$1, ListPipelinesRequest as ListPipelinesRequest$1, ListPipelinesResponse as ListPipelinesResponse$1, StartPipelineRequest as StartPipelineRequest$1, StartPipelineResponse as StartPipelineResponse$1, StopPipelineRequest as StopPipelineRequest$1, StopPipelineResponse as StopPipelineResponse$1, UpdatePipelineRequest as UpdatePipelineRequest$1, UpdatePipelineResponse as UpdatePipelineResponse$1 } from "../../dataplane/v1/pipeline_pb";

/**
 * @generated from message redpanda.api.console.v1alpha1.CreatePipelineRequest
 */
export class CreatePipelineRequest extends Message<CreatePipelineRequest> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.CreatePipelineRequest request = 1;
   */
  request?: CreatePipelineRequest$1;

  constructor(data?: PartialMessage<CreatePipelineRequest>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.CreatePipelineRequest";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "request", kind: "message", T: CreatePipelineRequest$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): CreatePipelineRequest {
    return new CreatePipelineRequest().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): CreatePipelineRequest {
    return new CreatePipelineRequest().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): CreatePipelineRequest {
    return new CreatePipelineRequest().fromJsonString(jsonString, options);
  }

  static equals(a: CreatePipelineRequest | PlainMessage<CreatePipelineRequest> | undefined, b: CreatePipelineRequest | PlainMessage<CreatePipelineRequest> | undefined): boolean {
    return proto3.util.equals(CreatePipelineRequest, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.CreatePipelineResponse
 */
export class CreatePipelineResponse extends Message<CreatePipelineResponse> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.CreatePipelineResponse response = 1;
   */
  response?: CreatePipelineResponse$1;

  constructor(data?: PartialMessage<CreatePipelineResponse>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.CreatePipelineResponse";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "response", kind: "message", T: CreatePipelineResponse$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): CreatePipelineResponse {
    return new CreatePipelineResponse().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): CreatePipelineResponse {
    return new CreatePipelineResponse().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): CreatePipelineResponse {
    return new CreatePipelineResponse().fromJsonString(jsonString, options);
  }

  static equals(a: CreatePipelineResponse | PlainMessage<CreatePipelineResponse> | undefined, b: CreatePipelineResponse | PlainMessage<CreatePipelineResponse> | undefined): boolean {
    return proto3.util.equals(CreatePipelineResponse, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.GetPipelineRequest
 */
export class GetPipelineRequest extends Message<GetPipelineRequest> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.GetPipelineRequest request = 1;
   */
  request?: GetPipelineRequest$1;

  constructor(data?: PartialMessage<GetPipelineRequest>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.GetPipelineRequest";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "request", kind: "message", T: GetPipelineRequest$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): GetPipelineRequest {
    return new GetPipelineRequest().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): GetPipelineRequest {
    return new GetPipelineRequest().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): GetPipelineRequest {
    return new GetPipelineRequest().fromJsonString(jsonString, options);
  }

  static equals(a: GetPipelineRequest | PlainMessage<GetPipelineRequest> | undefined, b: GetPipelineRequest | PlainMessage<GetPipelineRequest> | undefined): boolean {
    return proto3.util.equals(GetPipelineRequest, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.GetPipelineResponse
 */
export class GetPipelineResponse extends Message<GetPipelineResponse> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.GetPipelineResponse response = 1;
   */
  response?: GetPipelineResponse$1;

  constructor(data?: PartialMessage<GetPipelineResponse>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.GetPipelineResponse";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "response", kind: "message", T: GetPipelineResponse$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): GetPipelineResponse {
    return new GetPipelineResponse().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): GetPipelineResponse {
    return new GetPipelineResponse().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): GetPipelineResponse {
    return new GetPipelineResponse().fromJsonString(jsonString, options);
  }

  static equals(a: GetPipelineResponse | PlainMessage<GetPipelineResponse> | undefined, b: GetPipelineResponse | PlainMessage<GetPipelineResponse> | undefined): boolean {
    return proto3.util.equals(GetPipelineResponse, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.DeletePipelineRequest
 */
export class DeletePipelineRequest extends Message<DeletePipelineRequest> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.DeletePipelineRequest request = 1;
   */
  request?: DeletePipelineRequest$1;

  constructor(data?: PartialMessage<DeletePipelineRequest>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.DeletePipelineRequest";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "request", kind: "message", T: DeletePipelineRequest$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): DeletePipelineRequest {
    return new DeletePipelineRequest().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): DeletePipelineRequest {
    return new DeletePipelineRequest().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): DeletePipelineRequest {
    return new DeletePipelineRequest().fromJsonString(jsonString, options);
  }

  static equals(a: DeletePipelineRequest | PlainMessage<DeletePipelineRequest> | undefined, b: DeletePipelineRequest | PlainMessage<DeletePipelineRequest> | undefined): boolean {
    return proto3.util.equals(DeletePipelineRequest, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.DeletePipelineResponse
 */
export class DeletePipelineResponse extends Message<DeletePipelineResponse> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.DeletePipelineResponse response = 1;
   */
  response?: DeletePipelineResponse$1;

  constructor(data?: PartialMessage<DeletePipelineResponse>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.DeletePipelineResponse";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "response", kind: "message", T: DeletePipelineResponse$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): DeletePipelineResponse {
    return new DeletePipelineResponse().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): DeletePipelineResponse {
    return new DeletePipelineResponse().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): DeletePipelineResponse {
    return new DeletePipelineResponse().fromJsonString(jsonString, options);
  }

  static equals(a: DeletePipelineResponse | PlainMessage<DeletePipelineResponse> | undefined, b: DeletePipelineResponse | PlainMessage<DeletePipelineResponse> | undefined): boolean {
    return proto3.util.equals(DeletePipelineResponse, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.ListPipelinesRequest
 */
export class ListPipelinesRequest extends Message<ListPipelinesRequest> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.ListPipelinesRequest request = 1;
   */
  request?: ListPipelinesRequest$1;

  constructor(data?: PartialMessage<ListPipelinesRequest>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.ListPipelinesRequest";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "request", kind: "message", T: ListPipelinesRequest$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ListPipelinesRequest {
    return new ListPipelinesRequest().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ListPipelinesRequest {
    return new ListPipelinesRequest().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ListPipelinesRequest {
    return new ListPipelinesRequest().fromJsonString(jsonString, options);
  }

  static equals(a: ListPipelinesRequest | PlainMessage<ListPipelinesRequest> | undefined, b: ListPipelinesRequest | PlainMessage<ListPipelinesRequest> | undefined): boolean {
    return proto3.util.equals(ListPipelinesRequest, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.ListPipelinesResponse
 */
export class ListPipelinesResponse extends Message<ListPipelinesResponse> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.ListPipelinesResponse response = 1;
   */
  response?: ListPipelinesResponse$1;

  constructor(data?: PartialMessage<ListPipelinesResponse>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.ListPipelinesResponse";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "response", kind: "message", T: ListPipelinesResponse$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ListPipelinesResponse {
    return new ListPipelinesResponse().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ListPipelinesResponse {
    return new ListPipelinesResponse().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ListPipelinesResponse {
    return new ListPipelinesResponse().fromJsonString(jsonString, options);
  }

  static equals(a: ListPipelinesResponse | PlainMessage<ListPipelinesResponse> | undefined, b: ListPipelinesResponse | PlainMessage<ListPipelinesResponse> | undefined): boolean {
    return proto3.util.equals(ListPipelinesResponse, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.UpdatePipelineRequest
 */
export class UpdatePipelineRequest extends Message<UpdatePipelineRequest> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.UpdatePipelineRequest request = 1;
   */
  request?: UpdatePipelineRequest$1;

  constructor(data?: PartialMessage<UpdatePipelineRequest>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.UpdatePipelineRequest";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "request", kind: "message", T: UpdatePipelineRequest$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): UpdatePipelineRequest {
    return new UpdatePipelineRequest().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): UpdatePipelineRequest {
    return new UpdatePipelineRequest().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): UpdatePipelineRequest {
    return new UpdatePipelineRequest().fromJsonString(jsonString, options);
  }

  static equals(a: UpdatePipelineRequest | PlainMessage<UpdatePipelineRequest> | undefined, b: UpdatePipelineRequest | PlainMessage<UpdatePipelineRequest> | undefined): boolean {
    return proto3.util.equals(UpdatePipelineRequest, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.UpdatePipelineResponse
 */
export class UpdatePipelineResponse extends Message<UpdatePipelineResponse> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.UpdatePipelineResponse response = 1;
   */
  response?: UpdatePipelineResponse$1;

  constructor(data?: PartialMessage<UpdatePipelineResponse>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.UpdatePipelineResponse";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "response", kind: "message", T: UpdatePipelineResponse$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): UpdatePipelineResponse {
    return new UpdatePipelineResponse().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): UpdatePipelineResponse {
    return new UpdatePipelineResponse().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): UpdatePipelineResponse {
    return new UpdatePipelineResponse().fromJsonString(jsonString, options);
  }

  static equals(a: UpdatePipelineResponse | PlainMessage<UpdatePipelineResponse> | undefined, b: UpdatePipelineResponse | PlainMessage<UpdatePipelineResponse> | undefined): boolean {
    return proto3.util.equals(UpdatePipelineResponse, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.StopPipelineRequest
 */
export class StopPipelineRequest extends Message<StopPipelineRequest> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.StopPipelineRequest request = 1;
   */
  request?: StopPipelineRequest$1;

  constructor(data?: PartialMessage<StopPipelineRequest>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.StopPipelineRequest";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "request", kind: "message", T: StopPipelineRequest$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): StopPipelineRequest {
    return new StopPipelineRequest().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): StopPipelineRequest {
    return new StopPipelineRequest().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): StopPipelineRequest {
    return new StopPipelineRequest().fromJsonString(jsonString, options);
  }

  static equals(a: StopPipelineRequest | PlainMessage<StopPipelineRequest> | undefined, b: StopPipelineRequest | PlainMessage<StopPipelineRequest> | undefined): boolean {
    return proto3.util.equals(StopPipelineRequest, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.StopPipelineResponse
 */
export class StopPipelineResponse extends Message<StopPipelineResponse> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.StopPipelineResponse response = 1;
   */
  response?: StopPipelineResponse$1;

  constructor(data?: PartialMessage<StopPipelineResponse>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.StopPipelineResponse";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "response", kind: "message", T: StopPipelineResponse$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): StopPipelineResponse {
    return new StopPipelineResponse().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): StopPipelineResponse {
    return new StopPipelineResponse().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): StopPipelineResponse {
    return new StopPipelineResponse().fromJsonString(jsonString, options);
  }

  static equals(a: StopPipelineResponse | PlainMessage<StopPipelineResponse> | undefined, b: StopPipelineResponse | PlainMessage<StopPipelineResponse> | undefined): boolean {
    return proto3.util.equals(StopPipelineResponse, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.StartPipelineRequest
 */
export class StartPipelineRequest extends Message<StartPipelineRequest> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.StartPipelineRequest request = 1;
   */
  request?: StartPipelineRequest$1;

  constructor(data?: PartialMessage<StartPipelineRequest>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.StartPipelineRequest";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "request", kind: "message", T: StartPipelineRequest$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): StartPipelineRequest {
    return new StartPipelineRequest().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): StartPipelineRequest {
    return new StartPipelineRequest().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): StartPipelineRequest {
    return new StartPipelineRequest().fromJsonString(jsonString, options);
  }

  static equals(a: StartPipelineRequest | PlainMessage<StartPipelineRequest> | undefined, b: StartPipelineRequest | PlainMessage<StartPipelineRequest> | undefined): boolean {
    return proto3.util.equals(StartPipelineRequest, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.StartPipelineResponse
 */
export class StartPipelineResponse extends Message<StartPipelineResponse> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.StartPipelineResponse response = 1;
   */
  response?: StartPipelineResponse$1;

  constructor(data?: PartialMessage<StartPipelineResponse>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.StartPipelineResponse";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "response", kind: "message", T: StartPipelineResponse$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): StartPipelineResponse {
    return new StartPipelineResponse().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): StartPipelineResponse {
    return new StartPipelineResponse().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): StartPipelineResponse {
    return new StartPipelineResponse().fromJsonString(jsonString, options);
  }

  static equals(a: StartPipelineResponse | PlainMessage<StartPipelineResponse> | undefined, b: StartPipelineResponse | PlainMessage<StartPipelineResponse> | undefined): boolean {
    return proto3.util.equals(StartPipelineResponse, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.GetPipelineServiceConfigSchemaRequest
 */
export class GetPipelineServiceConfigSchemaRequest extends Message<GetPipelineServiceConfigSchemaRequest> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.GetPipelineServiceConfigSchemaRequest request = 1;
   */
  request?: GetPipelineServiceConfigSchemaRequest$1;

  constructor(data?: PartialMessage<GetPipelineServiceConfigSchemaRequest>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.GetPipelineServiceConfigSchemaRequest";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "request", kind: "message", T: GetPipelineServiceConfigSchemaRequest$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): GetPipelineServiceConfigSchemaRequest {
    return new GetPipelineServiceConfigSchemaRequest().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): GetPipelineServiceConfigSchemaRequest {
    return new GetPipelineServiceConfigSchemaRequest().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): GetPipelineServiceConfigSchemaRequest {
    return new GetPipelineServiceConfigSchemaRequest().fromJsonString(jsonString, options);
  }

  static equals(a: GetPipelineServiceConfigSchemaRequest | PlainMessage<GetPipelineServiceConfigSchemaRequest> | undefined, b: GetPipelineServiceConfigSchemaRequest | PlainMessage<GetPipelineServiceConfigSchemaRequest> | undefined): boolean {
    return proto3.util.equals(GetPipelineServiceConfigSchemaRequest, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.GetPipelineServiceConfigSchemaResponse
 */
export class GetPipelineServiceConfigSchemaResponse extends Message<GetPipelineServiceConfigSchemaResponse> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.GetPipelineServiceConfigSchemaResponse response = 1;
   */
  response?: GetPipelineServiceConfigSchemaResponse$1;

  constructor(data?: PartialMessage<GetPipelineServiceConfigSchemaResponse>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.GetPipelineServiceConfigSchemaResponse";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "response", kind: "message", T: GetPipelineServiceConfigSchemaResponse$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): GetPipelineServiceConfigSchemaResponse {
    return new GetPipelineServiceConfigSchemaResponse().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): GetPipelineServiceConfigSchemaResponse {
    return new GetPipelineServiceConfigSchemaResponse().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): GetPipelineServiceConfigSchemaResponse {
    return new GetPipelineServiceConfigSchemaResponse().fromJsonString(jsonString, options);
  }

  static equals(a: GetPipelineServiceConfigSchemaResponse | PlainMessage<GetPipelineServiceConfigSchemaResponse> | undefined, b: GetPipelineServiceConfigSchemaResponse | PlainMessage<GetPipelineServiceConfigSchemaResponse> | undefined): boolean {
    return proto3.util.equals(GetPipelineServiceConfigSchemaResponse, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.GetPipelinesForSecretRequest
 */
export class GetPipelinesForSecretRequest extends Message<GetPipelinesForSecretRequest> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.GetPipelinesForSecretRequest request = 1;
   */
  request?: GetPipelinesForSecretRequest$1;

  constructor(data?: PartialMessage<GetPipelinesForSecretRequest>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.GetPipelinesForSecretRequest";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "request", kind: "message", T: GetPipelinesForSecretRequest$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): GetPipelinesForSecretRequest {
    return new GetPipelinesForSecretRequest().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): GetPipelinesForSecretRequest {
    return new GetPipelinesForSecretRequest().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): GetPipelinesForSecretRequest {
    return new GetPipelinesForSecretRequest().fromJsonString(jsonString, options);
  }

  static equals(a: GetPipelinesForSecretRequest | PlainMessage<GetPipelinesForSecretRequest> | undefined, b: GetPipelinesForSecretRequest | PlainMessage<GetPipelinesForSecretRequest> | undefined): boolean {
    return proto3.util.equals(GetPipelinesForSecretRequest, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.GetPipelinesForSecretResponse
 */
export class GetPipelinesForSecretResponse extends Message<GetPipelinesForSecretResponse> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.GetPipelinesForSecretResponse response = 1;
   */
  response?: GetPipelinesForSecretResponse$1;

  constructor(data?: PartialMessage<GetPipelinesForSecretResponse>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.GetPipelinesForSecretResponse";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "response", kind: "message", T: GetPipelinesForSecretResponse$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): GetPipelinesForSecretResponse {
    return new GetPipelinesForSecretResponse().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): GetPipelinesForSecretResponse {
    return new GetPipelinesForSecretResponse().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): GetPipelinesForSecretResponse {
    return new GetPipelinesForSecretResponse().fromJsonString(jsonString, options);
  }

  static equals(a: GetPipelinesForSecretResponse | PlainMessage<GetPipelinesForSecretResponse> | undefined, b: GetPipelinesForSecretResponse | PlainMessage<GetPipelinesForSecretResponse> | undefined): boolean {
    return proto3.util.equals(GetPipelinesForSecretResponse, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.GetPipelinesBySecretsRequest
 */
export class GetPipelinesBySecretsRequest extends Message<GetPipelinesBySecretsRequest> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.GetPipelinesBySecretsRequest request = 1;
   */
  request?: GetPipelinesBySecretsRequest$1;

  constructor(data?: PartialMessage<GetPipelinesBySecretsRequest>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.GetPipelinesBySecretsRequest";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "request", kind: "message", T: GetPipelinesBySecretsRequest$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): GetPipelinesBySecretsRequest {
    return new GetPipelinesBySecretsRequest().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): GetPipelinesBySecretsRequest {
    return new GetPipelinesBySecretsRequest().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): GetPipelinesBySecretsRequest {
    return new GetPipelinesBySecretsRequest().fromJsonString(jsonString, options);
  }

  static equals(a: GetPipelinesBySecretsRequest | PlainMessage<GetPipelinesBySecretsRequest> | undefined, b: GetPipelinesBySecretsRequest | PlainMessage<GetPipelinesBySecretsRequest> | undefined): boolean {
    return proto3.util.equals(GetPipelinesBySecretsRequest, a, b);
  }
}

/**
 * @generated from message redpanda.api.console.v1alpha1.GetPipelinesBySecretsResponse
 */
export class GetPipelinesBySecretsResponse extends Message<GetPipelinesBySecretsResponse> {
  /**
   * @generated from field: redpanda.api.dataplane.v1.GetPipelinesBySecretsResponse response = 1;
   */
  response?: GetPipelinesBySecretsResponse$1;

  constructor(data?: PartialMessage<GetPipelinesBySecretsResponse>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "redpanda.api.console.v1alpha1.GetPipelinesBySecretsResponse";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "response", kind: "message", T: GetPipelinesBySecretsResponse$1 },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): GetPipelinesBySecretsResponse {
    return new GetPipelinesBySecretsResponse().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): GetPipelinesBySecretsResponse {
    return new GetPipelinesBySecretsResponse().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): GetPipelinesBySecretsResponse {
    return new GetPipelinesBySecretsResponse().fromJsonString(jsonString, options);
  }

  static equals(a: GetPipelinesBySecretsResponse | PlainMessage<GetPipelinesBySecretsResponse> | undefined, b: GetPipelinesBySecretsResponse | PlainMessage<GetPipelinesBySecretsResponse> | undefined): boolean {
    return proto3.util.equals(GetPipelinesBySecretsResponse, a, b);
  }
}

