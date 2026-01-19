/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

"use client";

import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import { getRouteApi } from "@tanstack/react-router";

const routeApi = getRouteApi("/knowledgebases/$knowledgebaseId/");

import { Card, CardContent } from "components/redpanda-ui/components/card";
import { Skeleton } from "components/redpanda-ui/components/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "components/redpanda-ui/components/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "components/redpanda-ui/components/tooltip";
import { Heading, Text } from "components/redpanda-ui/components/typography";
import {
	ConsumerGroupStatus,
	getConsumerGroupStateDescription,
} from "components/ui/consumer-group/consumer-group-status";
import { ConsumerLag } from "components/ui/consumer-group/consumer-lag";
import { CircleHelp, Search, Settings } from "lucide-react";
import { runInAction } from "mobx";
import {
	type KnowledgeBase,
	type KnowledgeBaseUpdate,
	KnowledgeBaseUpdate_EmbeddingGenerator_Provider_CohereSchema,
	KnowledgeBaseUpdate_EmbeddingGenerator_Provider_OpenAISchema,
	KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema,
	KnowledgeBaseUpdate_EmbeddingGeneratorSchema,
	KnowledgeBaseUpdate_Generation_Provider_OpenAISchema,
	KnowledgeBaseUpdate_Generation_ProviderSchema,
	KnowledgeBaseUpdate_GenerationSchema,
	KnowledgeBaseUpdate_IndexerSchema,
	KnowledgeBaseUpdate_Retriever_Reranker_Provider_CohereSchema,
	KnowledgeBaseUpdate_Retriever_Reranker_ProviderSchema,
	KnowledgeBaseUpdate_Retriever_RerankerSchema,
	KnowledgeBaseUpdate_RetrieverSchema,
	KnowledgeBaseUpdate_VectorDatabase_PostgresSchema,
	KnowledgeBaseUpdate_VectorDatabaseSchema,
	KnowledgeBaseUpdateSchema,
	UpdateKnowledgeBaseRequestSchema,
} from "protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useLegacyConsumerGroupDetailsQuery } from "react-query/api/consumer-group";
import {
	useGetKnowledgeBaseQuery,
	useUpdateKnowledgeBaseMutation,
} from "react-query/api/knowledge-base";
import { useListSecretsQuery } from "react-query/api/secret";
import { toast } from "sonner";
import { uiState } from "state/ui-state";
import {
	isRegexPattern,
	markAsRegexPattern,
	stripRegexPrefix,
} from "../create/schemas";
import { KnowledgeBaseConfigurationTab } from "./knowledge-base-configuration-tab";
import { PlaygroundTab } from "./knowledge-base-playground-tab";

// Extended type for edit form that includes split topic fields
type KnowledgeBaseUpdateForm = KnowledgeBaseUpdate & {
	indexer?: KnowledgeBaseUpdate["indexer"] & {
		exactTopics?: string[];
		regexPatterns?: string[];
	};
};

export const updatePageTitle = (knowledgebaseId?: string) => {
	runInAction(() => {
		uiState.pageTitle = knowledgebaseId
			? `Knowledge Base - ${knowledgebaseId}`
			: "Knowledge Base Details";
		uiState.pageBreadcrumbs = [
			{ title: "Knowledge Bases", linkTo: "/knowledgebases" },
			{
				title: knowledgebaseId || "Details",
				linkTo: "",
				heading: knowledgebaseId || "Knowledge Base Details",
			},
		];
	});
};

export type KnowledgeBaseEditTabsRef = {
	handleSave: () => Promise<void>;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
function initializeFormData(kb: KnowledgeBase): KnowledgeBaseUpdateForm {
	if (!kb) {
		return create(KnowledgeBaseUpdateSchema, {
			displayName: "",
			description: "",
			tags: {},
		});
	}

	const updateData = create(KnowledgeBaseUpdateSchema, {
		displayName: kb.displayName || "",
		description: kb.description || "",
		tags: { ...(kb.tags || {}) },
	});

	if (kb.vectorDatabase?.vectorDatabase.case === "postgres") {
		updateData.vectorDatabase = create(
			KnowledgeBaseUpdate_VectorDatabaseSchema,
			{
				vectorDatabase: {
					case: "postgres",
					value: create(KnowledgeBaseUpdate_VectorDatabase_PostgresSchema, {
						dsn: kb.vectorDatabase.vectorDatabase.value.dsn,
					}),
				},
			},
		);
	}

	if (kb.embeddingGenerator) {
		const embGen = kb.embeddingGenerator;
		updateData.embeddingGenerator = create(
			KnowledgeBaseUpdate_EmbeddingGeneratorSchema,
			{},
		);

		if (embGen.provider?.provider.case === "openai") {
			updateData.embeddingGenerator.provider = create(
				KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema,
				{
					provider: {
						case: "openai",
						value: create(
							KnowledgeBaseUpdate_EmbeddingGenerator_Provider_OpenAISchema,
							{
								apiKey: embGen.provider.provider.value.apiKey,
							},
						),
					},
				},
			);
		} else if (embGen.provider?.provider.case === "cohere") {
			updateData.embeddingGenerator.provider = create(
				KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema,
				{
					provider: {
						case: "cohere",
						value: create(
							KnowledgeBaseUpdate_EmbeddingGenerator_Provider_CohereSchema,
							{
								baseUrl: embGen.provider.provider.value.baseUrl,
								apiKey: embGen.provider.provider.value.apiKey,
							},
						),
					},
				},
			);
		} else {
			updateData.embeddingGenerator.provider = create(
				KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema,
				{
					provider: {
						case: "openai",
						value: create(
							KnowledgeBaseUpdate_EmbeddingGenerator_Provider_OpenAISchema,
							{
								apiKey: "",
							},
						),
					},
				},
			);
		}
	}

	if (kb.indexer) {
		// Split inputTopics into exactTopics and regexPatterns
		// Topics with 'regex:' prefix are regex patterns, others are exact topics
		const exactTopics: string[] = [];
		const regexPatterns: string[] = [];

		for (const topic of kb.indexer.inputTopics || []) {
			if (isRegexPattern(topic)) {
				// Strip the 'regex:' prefix for display in the UI
				regexPatterns.push(stripRegexPrefix(topic));
			} else {
				exactTopics.push(topic);
			}
		}

		const indexer = create(KnowledgeBaseUpdate_IndexerSchema, {
			chunkSize: kb.indexer.chunkSize,
			chunkOverlap: kb.indexer.chunkOverlap,
			redpandaUsername: kb.indexer.redpandaUsername,
			redpandaPassword: kb.indexer.redpandaPassword,
			redpandaSaslMechanism: kb.indexer.redpandaSaslMechanism,
			inputTopics: kb.indexer.inputTopics ? [...kb.indexer.inputTopics] : [],
		});

		// Add the split fields to the indexer object (not part of protobuf schema)
		updateData.indexer = Object.assign(indexer, { exactTopics, regexPatterns });
	}

	if (kb.retriever) {
		updateData.retriever = create(KnowledgeBaseUpdate_RetrieverSchema, {});

		if (kb.retriever.reranker) {
			const reranker = kb.retriever.reranker;
			updateData.retriever.reranker = create(
				KnowledgeBaseUpdate_Retriever_RerankerSchema,
				{
					enabled: reranker.enabled,
				},
			);

			if (reranker.provider?.provider.case === "cohere") {
				updateData.retriever.reranker.provider = create(
					KnowledgeBaseUpdate_Retriever_Reranker_ProviderSchema,
					{
						provider: {
							case: "cohere",
							value: create(
								KnowledgeBaseUpdate_Retriever_Reranker_Provider_CohereSchema,
								{
									apiKey: reranker.provider.provider.value.apiKey,
									model: reranker.provider.provider.value.model,
								},
							),
						},
					},
				);
			}
		}
	}

	if (kb.generation) {
		updateData.generation = create(KnowledgeBaseUpdate_GenerationSchema, {});

		if (kb.generation.provider?.provider.case === "openai") {
			updateData.generation.provider = create(
				KnowledgeBaseUpdate_Generation_ProviderSchema,
				{
					provider: {
						case: "openai",
						value: create(
							KnowledgeBaseUpdate_Generation_Provider_OpenAISchema,
							{
								apiKey: kb.generation.provider.provider.value.apiKey,
							},
						),
					},
				},
			);
		}
	}

	return updateData;
}

export const KnowledgeBaseDetailsPage = () => {
	const { knowledgebaseId } = routeApi.useParams();

	// Local state
	const [isEditMode, setIsEditMode] = useState(false);
	const [formHasChanges, setFormHasChanges] = useState(false);
	const prevEditModeRef = useRef(isEditMode);

	// Fetch knowledge base data
	const {
		data: knowledgeBaseResponse,
		isLoading: isLoadingKnowledgeBase,
		error: knowledgeBaseError,
		refetch: refetchKnowledgeBase,
	} = useGetKnowledgeBaseQuery({ id: knowledgebaseId || "" });

	const knowledgeBase = knowledgeBaseResponse?.knowledgeBase;

	// Fetch consumer group details for tooltip
	const consumerGroupId = knowledgeBase?.id
		? `${knowledgeBase.id}-indexer`
		: "";
	const { data: consumerGroup } = useLegacyConsumerGroupDetailsQuery(
		consumerGroupId,
		{
			enabled: !!knowledgeBase?.indexer && !!knowledgeBase?.id,
		},
	);

	// Mutations
	const { mutate: updateKnowledgeBase, isPending: isUpdating } =
		useUpdateKnowledgeBaseMutation();

	// Preload secrets for knowledge base configuration
	useListSecretsQuery(undefined, { enabled: !!knowledgebaseId });

	// Form setup
	const form = useForm<KnowledgeBaseUpdateForm>({
		defaultValues: knowledgeBase
			? initializeFormData(knowledgeBase)
			: undefined,
		mode: "onChange",
	});

	const refreshFormData = useCallback(() => {
		if (knowledgeBase) {
			form.reset(initializeFormData(knowledgeBase));
			setFormHasChanges(false);
		}
	}, [knowledgeBase, form]);

	useEffect(() => {
		if (knowledgebaseId) {
			updatePageTitle(knowledgebaseId);
		}
	}, [knowledgebaseId]);

	// Only refresh form when entering edit mode, not when data refetches while in edit mode
	useEffect(() => {
		const wasEditMode = prevEditModeRef.current;
		const isEnteringEditMode = isEditMode && !wasEditMode;

		if (isEnteringEditMode && knowledgeBase) {
			refreshFormData();
		}

		prevEditModeRef.current = isEditMode;
	}, [isEditMode, knowledgeBase, refreshFormData]);

	// Subscribe to form changes by accessing isDirty during render
	const { isDirty } = form.formState;

	useEffect(() => {
		setFormHasChanges(isDirty);
	}, [isDirty]);

	const generateUpdateMask = useCallback((): string[] => {
		const updateMask: string[] = [];
		const dirtyFields = form.formState.dirtyFields;

		const walkDirtyFields = (
			obj: Record<string, unknown>,
			path: string[] = [],
		) => {
			for (const key in obj) {
				if (Object.hasOwn(obj, key)) {
					const currentPath = [...path, key];
					const value = obj[key];
					if (value !== true && typeof value === "object" && value !== null) {
						walkDirtyFields(value as Record<string, unknown>, currentPath);
					} else {
						const protobufPath = currentPath
							.map((segment) =>
								segment.replace(/([A-Z])/g, "_$1").toLowerCase(),
							)
							.join(".");
						updateMask.push(protobufPath);
					}
				}
			}
		};

		walkDirtyFields(dirtyFields);
		return updateMask;
	}, [form.formState.dirtyFields]);

	// Handlers
	const handleStartEdit = () => {
		setIsEditMode(true);
		setFormHasChanges(false);
	};

	const handleCancelEdit = () => {
		setIsEditMode(false);
		setFormHasChanges(false);
		refreshFormData();
	};

	const handleSave = async () => {
		const formData = form.getValues();

		// Combine exactTopics and regexPatterns into inputTopics before sending to API
		// Add 'regex:' prefix to regex patterns so backend can differentiate them
		if (formData.indexer) {
			const exactTopics = (formData.indexer.exactTopics || []).filter(
				(topic) => topic && topic.trim() !== "",
			);
			const regexPatterns = (formData.indexer.regexPatterns || [])
				.filter((pattern) => pattern && pattern.trim() !== "")
				.map((pattern) => markAsRegexPattern(pattern));
			formData.indexer.inputTopics = [...exactTopics, ...regexPatterns];
		}

		let updateMask = generateUpdateMask();

		// Fix updateMask for retriever changes - the deep nested discriminated union path
		// doesn't match the backend's expected protobuf field path
		updateMask = updateMask.map((path) => {
			// Convert deep nested retriever paths to just 'retriever' since we send the whole object
			if (path.startsWith("retriever.reranker.provider.provider.value")) {
				return "retriever";
			}
			// Map exactTopics and regexPatterns to the actual protobuf field input_topics
			if (
				path === "indexer.exact_topics" ||
				path === "indexer.regex_patterns"
			) {
				return "indexer.input_topics";
			}
			// For vectorDatabase updates, be specific about the DSN field to preserve table name
			if (path === "vector_database") {
				return "vector_database.postgres.dsn";
			}
			return path;
		});

		// Remove duplicates
		updateMask = Array.from(new Set(updateMask));

		await handleUpdate(formData, updateMask);
	};

	const handleUpdate = (
		updatedKnowledgeBase: KnowledgeBaseUpdate,
		updateMask?: string[],
	) => {
		if (!knowledgeBase) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, reject) => {
			const request = create(UpdateKnowledgeBaseRequestSchema, {
				id: knowledgeBase.id,
				knowledgeBase: updatedKnowledgeBase,
				updateMask: updateMask
					? create(FieldMaskSchema, { paths: updateMask })
					: undefined,
			});

			updateKnowledgeBase(request, {
				onSuccess: () => {
					toast.success("Knowledge base updated successfully");
					refetchKnowledgeBase();
					setIsEditMode(false);
					setFormHasChanges(false);
					form.reset(updatedKnowledgeBase, { keepValues: true });
					resolve();
				},
				onError: (err: unknown) => {
					toast.error("Failed to update knowledge base", {
						description: String(err),
					});
					reject(err);
				},
			});
		});
	};

	// Loading state
	if (isLoadingKnowledgeBase) {
		return (
			<div className="flex flex-col gap-4 p-6">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-4 w-96" />
				<Skeleton className="mt-4 h-32 w-full" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	// Error state
	if (knowledgeBaseError || !knowledgeBase) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="max-w-md text-center">
					<Text className="text-red-600">
						{knowledgeBaseError
							? `Failed to load knowledge base: ${String(knowledgeBaseError)}`
							: "Knowledge base not found"}
					</Text>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{/* Header */}
			<div>
				<Heading level={1}>{knowledgeBase.displayName}</Heading>
				{Boolean(knowledgeBase.description) && (
					<Text className="mt-2" variant="muted">
						{knowledgeBase.description}
					</Text>
				)}
			</div>

			{/* Consumer Group Status Card */}
			<Card>
				<CardContent>
					<div className="flex gap-8">
						<div>
							<div className="mb-1 flex items-center gap-1">
								<Text className="font-medium text-sm" variant="muted">
									Indexer Status
								</Text>
								{consumerGroup?.state ? (
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													className="inline-flex cursor-help"
													type="button"
												>
													<CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
												</button>
											</TooltipTrigger>
											<TooltipContent className="max-w-xs">
												<Text>
													{getConsumerGroupStateDescription(
														consumerGroup.state,
													)}
												</Text>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								) : null}
							</div>
							<ConsumerGroupStatus
								consumerGroupId={`${knowledgeBase.id}-indexer`}
								fallbackInfo={{
									configured: !!knowledgeBase.indexer,
									itemCount: knowledgeBase.indexer?.inputTopics?.length ?? 0,
									itemLabel: "topic",
								}}
								showDetails={true}
							/>
						</div>

						<div>
							<Text className="mb-1 font-medium text-sm" variant="muted">
								Consumer Lag
							</Text>
							<ConsumerLag
								consumerGroupId={`${knowledgeBase.id}-indexer`}
								enabled={!!knowledgeBase.indexer}
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Configuration and Playground Tabs */}
			<FormProvider {...form}>
				<Tabs defaultValue="configuration">
					<TabsList>
						<TabsTrigger value="configuration">
							<Settings className="mr-2 h-4 w-4" />
							Configuration
						</TabsTrigger>
						<TabsTrigger value="playground">
							<Search className="mr-2 h-4 w-4" />
							Playground
						</TabsTrigger>
					</TabsList>

					<TabsContent value="configuration">
						<KnowledgeBaseConfigurationTab
							formHasChanges={formHasChanges}
							isEditMode={isEditMode}
							isUpdating={isUpdating}
							knowledgeBase={knowledgeBase}
							onCancelEdit={handleCancelEdit}
							onSave={handleSave}
							onStartEdit={handleStartEdit}
						/>
					</TabsContent>

					<TabsContent value="playground">
						<PlaygroundTab knowledgeBase={knowledgeBase} />
					</TabsContent>
				</Tabs>
			</FormProvider>
		</div>
	);
};
