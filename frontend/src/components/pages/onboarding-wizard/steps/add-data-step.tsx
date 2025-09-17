import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "components/redpanda-ui/components/badge";
import { Card, CardContent } from "components/redpanda-ui/components/card";
import {
	Choicebox,
	ChoiceboxItem,
	ChoiceboxItemIndicator,
} from "components/redpanda-ui/components/choicebox";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "components/redpanda-ui/components/form";
import { Input, InputStart } from "components/redpanda-ui/components/input";
import { Label } from "components/redpanda-ui/components/label";
import { SimpleMultiSelect } from "components/redpanda-ui/components/multi-select";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "components/redpanda-ui/components/toggle-group";
import { Text } from "components/redpanda-ui/components/typography";
import { FolderInput, FolderOutput, SearchIcon } from "lucide-react";
import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAddDataFormData } from "../../../../state/onboarding-wizard/state";
import type { DataType, StepSubmissionResult } from "../types";
import type { ComponentSpec } from "../types/connect";
import {
	type ConnectionType,
	getAllComponents,
	getCategoryConfig,
	getStatusConfig,
	inferComponentCategory,
} from "../utils/connect";

const formSchema = z.object({
	connection: z
		.string()
		.min(1, { message: "Please select a connection method." }),
});

export type AddDataFormData = z.infer<typeof formSchema>;

export interface AddDataStepRef {
	triggerSubmit: () => Promise<StepSubmissionResult>;
	isLoading: boolean;
}

type ComponentTypeFilter = "input" | "output";

export const AddDataStep = forwardRef<
	AddDataStepRef,
	{
		dataType?: DataType;
		additionalConnections?: ConnectionType[];
		defaultComponentTypeFilter?: ComponentTypeFilter[];
	}
>(
	(
		{
			dataType: _dataType = "source",
			additionalConnections: _additionalConnections,
			defaultComponentTypeFilter = ["input", "output"],
		},
		ref,
	) => {
		const [filter, setFilter] = useState<string>("");
		const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
		const [componentTypeFilter, setComponentTypeFilter] = useState<
			ComponentTypeFilter[]
		>(defaultComponentTypeFilter);
		const { data: persistedDataFormData, setData: setConnectionData } =
			useAddDataFormData();

		const form = useForm<AddDataFormData>({
			resolver: zodResolver(formSchema),
			mode: "onChange",
			defaultValues: {
				connection: persistedDataFormData?.connection || "",
			},
		});

		// Form submission handler
		const handleSubmit = (data: AddDataFormData): StepSubmissionResult => {
			try {
				// Persist connection data to Zustand store
				setConnectionData(data);
				return {
					success: true,
					message: `Connected to ${data.connection} successfully!`,
				};
			} catch (error) {
				return {
					success: false,
					message: "Failed to save connection data",
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		};

		// Expose methods to parent wizard
		useImperativeHandle(ref, () => ({
			triggerSubmit: async () => {
				const isValid = await form.trigger();
				if (isValid) {
					const data = form.getValues();
					return handleSubmit(data);
				}
				return {
					success: false,
					message: "Please fix the form errors before proceeding",
					error: "Form validation failed",
				};
			},
			isLoading: false, // No async operations with localStorage
		}));

		// Get all components and extract unique categories
		const allComponents = useMemo(() => getAllComponents(), []);

		const availableCategories = useMemo(() => {
			const categorySet = new Set<string>();

			allComponents.forEach((component) => {
				// Use the categories field if available, otherwise infer from component name
				const categories =
					component.categories || inferComponentCategory(component.name);
				categories.forEach((category) => categorySet.add(category));
			});

			return Array.from(categorySet).sort();
		}, [allComponents]);

		// Filter components based on search, categories, and component type
		const filteredComponents = useMemo(() => {
			return allComponents.filter((component: ComponentSpec) => {
				// First, only include input and output components (exclude processors, caches, etc.)
				if (!["input", "output"].includes(component.type)) {
					return false;
				}

				// Then filter by selected component types (input/output)
				if (componentTypeFilter.length > 0) {
					if (
						!componentTypeFilter.includes(component.type as ComponentTypeFilter)
					) {
						return false;
					}
				} else {
					// If no component types are selected, show nothing
					return false;
				}

				// Filter by search text
				if (filter.trim()) {
					const searchLower = filter.toLowerCase();
					const matchesName = component.name
						.toLowerCase()
						.includes(searchLower);
					const matchesSummary = component.summary
						?.toLowerCase()
						.includes(searchLower);
					const matchesDescription = component.description
						?.toLowerCase()
						.includes(searchLower);

					if (!matchesName && !matchesSummary && !matchesDescription)
						return false;
				}

				// Filter by selected categories
				if (selectedCategories.length > 0) {
					const componentCategories =
						component.categories || inferComponentCategory(component.name);
					const hasMatchingCategory = componentCategories.some((cat) =>
						selectedCategories.includes(cat),
					);
					if (!hasMatchingCategory) return false;
				}

				return true;
			});
		}, [allComponents, componentTypeFilter, filter, selectedCategories]);

		return (
			<Card size="full">
				<CardContent>
					<Form {...form}>
						<div className="flex flex-col gap-4 mb-6">
							<div className="flex flex-wrap gap-4">
								<Label>
									Filter Connections
									<Input
										value={filter}
										onChange={(e) => {
											setFilter(e.target.value);
										}}
										placeholder="Search connections by name, summary, or description"
										className="w-[400px]"
									>
										<InputStart>
											<SearchIcon className="size-4" />
										</InputStart>
									</Input>
								</Label>

								<Label>
									Component Type
									<ToggleGroup
										type="multiple"
										value={componentTypeFilter}
										onValueChange={(value) => {
											setComponentTypeFilter(value as ComponentTypeFilter[]);
										}}
										className="justify-start"
									>
										<ToggleGroupItem value="input">
											<FolderInput className="size-4" />
											Input
										</ToggleGroupItem>
										<ToggleGroupItem value="output">
											<FolderOutput className="size-4" />
											Output
										</ToggleGroupItem>
									</ToggleGroup>
								</Label>

								<Label>
									Categories
									<SimpleMultiSelect
										options={availableCategories}
										value={selectedCategories}
										onValueChange={setSelectedCategories}
										placeholder="Filter by category"
										maxDisplay={3}
										width="md"
									/>
								</Label>
							</div>
						</div>

						<FormField
							control={form.control}
							name="connection"
							render={({ field }) => (
								<FormItem>
									<FormControl>
										<Choicebox>
											<div className="grid grid-cols-4 gap-2">
												{filteredComponents.map((component) => {
													// Get categories for display (use inferred if none provided)
													const componentCategories =
														component.categories ||
														inferComponentCategory(component.name);
													const categoryConfig =
														getCategoryConfig(componentCategories);
													const statusConfig = getStatusConfig(
														component.status,
													);

													return (
														<ChoiceboxItem
															value={component.name}
															key={component.name}
														>
															<div className="flex flex-col gap-2">
																<div className="flex items-center gap-2">
																	<Text className="truncate font-medium">
																		{component.name}
																	</Text>
																	{field.value === component.name && (
																		<ChoiceboxItemIndicator />
																	)}
																</div>
																{/* Component Summary */}
																{component.summary && (
																	<Text className="text-sm text-muted-foreground line-clamp-2">
																		{component.summary}
																	</Text>
																)}
																<div className="flex gap-1 flex-wrap">
																	{/* Component type badge */}
																	<Badge
																		className={`flex items-center gap-1 text-xs ${
																			component.type === "input"
																				? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
																				: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300"
																		}`}
																	>
																		{component.type === "input" ? (
																			<FolderInput className="h-3 w-3" />
																		) : (
																			<FolderOutput className="h-3 w-3" />
																		)}
																		<span className="leading-none">
																			{component.type.charAt(0).toUpperCase() +
																				component.type.slice(1)}
																		</span>
																	</Badge>
																	{/* Category badges */}
																	{categoryConfig?.map((c) => (
																		<Badge
																			className={`flex items-center gap-1 ${c.className} text-xs`}
																			key={c.text}
																		>
																			{c.icon}
																			<span className="leading-none">
																				{c.text}
																			</span>
																		</Badge>
																	))}
																	{/* Status badge for non-stable components */}
																	{component.status !== "stable" && (
																		<Badge
																			className={`flex items-center gap-1 ${statusConfig.className} text-xs`}
																		>
																			{statusConfig.icon}
																			<span className="leading-none">
																				{statusConfig.text}
																			</span>
																		</Badge>
																	)}
																</div>
															</div>
														</ChoiceboxItem>
													);
												})}
												{filteredComponents.length === 0 && (
													<div className="flex flex-col items-center justify-center py-8 text-center">
														{componentTypeFilter.length === 0 ? (
															<>
																<Text className="text-muted-foreground">
																	Select a component type to view connections
																</Text>
																<Text className="text-sm text-muted-foreground mt-1">
																	Choose Input, Output, or both from the filters
																	above
																</Text>
															</>
														) : (
															<>
																<Text className="text-muted-foreground">
																	No connections found matching your filters
																</Text>
																<Text className="text-sm text-muted-foreground mt-1">
																	Try adjusting your search, component type, or
																	category filters
																</Text>
															</>
														)}
													</div>
												)}
											</div>
										</Choicebox>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</Form>
				</CardContent>
			</Card>
		);
	},
);

AddDataStep.displayName = "AddDataStep";
