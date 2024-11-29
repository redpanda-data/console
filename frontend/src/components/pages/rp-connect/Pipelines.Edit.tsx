/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/* eslint-disable no-useless-escape */
import { action, makeObservable, observable } from "mobx";
import { observer } from "mobx-react";
import { appGlobal } from "../../../state/appGlobal";
import PageContent from "../../misc/PageContent";
import { PageComponent, PageInitHelper } from "../Page";
import {
	Box,
	Button,
	createStandaloneToast,
	Flex,
	FormField,
	Input,
} from "@redpanda-data/ui";
import { pipelinesApi } from "../../../state/backendApi";
import { DefaultSkeleton } from "../../../utils/tsxUtils";
import { Link } from "react-router-dom";
import { PipelineUpdate } from "../../../protogen/redpanda/api/dataplane/v1alpha2/pipeline_pb";
import { PipelineEditor } from "./Pipelines.Create";
import { Link as ChLink } from "@redpanda-data/ui";
import { formatPipelineError } from "./errors";
const { ToastContainer, toast } = createStandaloneToast();

@observer
class RpConnectPipelinesEdit extends PageComponent<{ pipelineId: string }> {
	@observable displayName = undefined as unknown as string;
	@observable description = undefined as unknown as string;
	@observable editorContent = undefined as unknown as string;
	@observable isUpdating = false;

	constructor(p: any) {
		super(p);
		makeObservable(this, undefined, { autoBind: true });
	}

	initPage(p: PageInitHelper): void {
		const pipelineId = this.props.pipelineId;

		p.title = "Edit Pipeline";
		p.addBreadcrumb("Redpanda Connect", "/connect-clusters");
		p.addBreadcrumb("Edit Pipeline", `/rp-connect/${pipelineId}/edit`);

		this.refreshData(true);
		appGlobal.onRefresh = () => this.refreshData(true);
	}

	refreshData(_force: boolean) {
		pipelinesApi.refreshPipelines(_force);
	}

	render() {
		if (!pipelinesApi.pipelines) return DefaultSkeleton;

		const pipelineId = this.props.pipelineId;
		const pipeline = pipelinesApi.pipelines.first((x) => x.id == pipelineId);
		if (!pipeline) return DefaultSkeleton;

		if (this.displayName == undefined) {
			this.displayName = pipeline.displayName;
			this.description = pipeline.description;
			this.editorContent = pipeline.configYaml;
		}

		const isNameEmpty = !this.displayName;

		return (
			<PageContent>
				<ToastContainer />

				<Box my="2">
					For help creating your pipeline, see our{" "}
					<ChLink
						href="https://docs.redpanda.com/redpanda-cloud/develop/connect/connect-quickstart/"
						isExternal
					>
						quickstart documentation
					</ChLink>
					, our{" "}
					<ChLink
						href="https://docs.redpanda.com/redpanda-cloud/develop/connect/cookbooks/"
						isExternal
					>
						library of examples
					</ChLink>
					, or our{" "}
					<ChLink
						href="https://docs.redpanda.com/redpanda-cloud/develop/connect/components/catalog/"
						isExternal
					>
						connector catalog
					</ChLink>
					.
				</Box>

				<FormField
					label="Pipeline name"
					isInvalid={isNameEmpty}
					errorText="Name cannot be empty"
				>
					<Flex alignItems="center" gap="2">
						<Input
							placeholder="Enter a config name..."
							data-testid="pipelineName"
							pattern="[a-zA-Z0-9_\-]+"
							isRequired
							value={this.displayName}
							onChange={(x) => (this.displayName = x.target.value)}
							width={500}
						/>
					</Flex>
				</FormField>
				<FormField label="Description">
					<Input
						data-testid="pipelineDescription"
						value={this.description}
						onChange={(x) => (this.description = x.target.value)}
						width={500}
					/>
				</FormField>

				<Box mt="4">
					<PipelineEditor
						yaml={this.editorContent}
						onChange={(x) => (this.editorContent = x)}
					/>
				</Box>

				<Flex alignItems="center" gap="4">
					<Button
						variant="solid"
						isDisabled={isNameEmpty || this.isUpdating}
						loadingText="Updating..."
						isLoading={this.isUpdating}
						onClick={action(() => this.updatePipeline())}
					>
						Update
					</Button>
					<Link to={`/rp-connect/${pipelineId}`}>
						<Button variant="link">Cancel</Button>
					</Link>
				</Flex>
			</PageContent>
		);
	}

	async updatePipeline() {
		this.isUpdating = true;
		const pipelineId = this.props.pipelineId;

		pipelinesApi
			.updatePipeline(
				pipelineId,
				new PipelineUpdate({
					displayName: this.displayName,
					configYaml: this.editorContent,
					description: this.description,
					resources: undefined,
				}),
			)
			.then(async () => {
				toast({
					status: "success",
					duration: 4000,
					isClosable: false,
					title: "Pipeline updated",
				});
				await pipelinesApi.refreshPipelines(true);
				appGlobal.history.push(`/rp-connect/${pipelineId}`);
			})
			.catch((err) => {
				toast({
					status: "error",
					duration: null,
					isClosable: true,
					title: "Failed to update pipeline",
					description: formatPipelineError(err),
				});
			})
			.finally(() => {
				this.isUpdating = false;
			});
	}
}

export default RpConnectPipelinesEdit;
