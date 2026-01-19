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
import type { ConnectError } from "@connectrpc/connect";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "components/redpanda-ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "components/redpanda-ui/components/dialog";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "components/redpanda-ui/components/field";
import { Form } from "components/redpanda-ui/components/form";
import { Input } from "components/redpanda-ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "components/redpanda-ui/components/select";
import { Text } from "components/redpanda-ui/components/typography";
import { KeyRound, Loader2, Plus } from "lucide-react";
import { CreateSecretRequestSchema } from "protogen/redpanda/api/console/v1alpha1/secret_pb";
import {
	CreateSecretRequestSchema as CreateSecretRequestSchemaDataPlane,
	type Scope,
} from "protogen/redpanda/api/dataplane/v1/secret_pb";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useCreateSecretMutation } from "react-query/api/secret";
import { toast } from "sonner";
import { formatToastErrorMessageGRPC } from "utils/toast.utils";
import { base64ToUInt8Array, encodeBase64 } from "utils/utils";
import { z } from "zod";

// OpenAI API key validation pattern
export const OPENAI_API_KEY_PATTERN = {
	regex: /^sk-(proj-)?[A-Za-z0-9-_]{20,}$/,
	message:
		'Invalid OpenAI API key format. Must start with "sk-" or "sk-proj-" followed by at least 20 alphanumeric characters',
};

// Generic validation that accepts any non-empty string
export const GENERIC_SECRET_VALUE_PATTERN = {
	regex: /.+/,
	message: "Secret value is required",
};

export type SecretSelectorCustomText = {
	/** Dialog description shown when creating a new secret */
	dialogDescription: string;
	/** Placeholder for the secret name input */
	secretNamePlaceholder: string;
	/** Placeholder for the secret value input */
	secretValuePlaceholder: string;
	/** Description shown below the secret value input */
	secretValueDescription: string;
	/** Description shown in empty state when no secrets are available */
	emptyStateDescription: string;
};

/** Default text for AI agent API key secrets */
export const AI_AGENT_SECRET_TEXT: SecretSelectorCustomText = {
	dialogDescription:
		"Create a new secret for your OpenAI API key. The secret will be stored securely.",
	secretNamePlaceholder: "e.g., OPENAI_API_KEY",
	secretValuePlaceholder: "sk-...",
	secretValueDescription: "Your OpenAI API key",
	emptyStateDescription:
		"Create a secret to securely store your OpenAI API key",
};

type SecretSelectorProps = {
	value: string;
	onChange: (value: string) => void;
	availableSecrets: Array<{ id: string; name: string }>;
	placeholder?: string;
	onSecretCreated?: (secretId: string) => void;
	scopes: Scope[];
	/** Custom text for dialog and form fields */
	customText: SecretSelectorCustomText;
};

const NewSecretFormSchema = z.object({
	name: z
		.string()
		.min(1, "Secret name is required")
		.max(255, "Secret name must be fewer than 255 characters")
		.regex(
			/^[A-Za-z][A-Za-z0-9_]*$/,
			"Secret name must start with a letter and contain only letters, numbers, and underscores",
		),
	value: z
		.string()
		.min(1, "Secret value is required")
		.min(20, "Secret value must be at least 20 characters"),
});

type NewSecretFormData = z.infer<typeof NewSecretFormSchema>;

export const SecretSelector: React.FC<SecretSelectorProps> = ({
	value,
	onChange,
	availableSecrets,
	placeholder = "Select from secrets store or create new",
	onSecretCreated,
	scopes,
	customText,
}) => {
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const { mutateAsync: createSecret, isPending: isCreateSecretPending } =
		useCreateSecretMutation();

	const form = useForm<NewSecretFormData>({
		resolver: zodResolver(NewSecretFormSchema),
		defaultValues: {
			name: "",
			value: "",
		},
		mode: "onChange", // Validate on change to show errors immediately
	});

	const handleCreateSecret = async (data: NewSecretFormData) => {
		try {
			const dataPlaneRequest = create(CreateSecretRequestSchemaDataPlane, {
				id: data.name,
				secretData: base64ToUInt8Array(encodeBase64(data.value)),
				scopes,
				labels: {},
			});

			await createSecret(
				create(CreateSecretRequestSchema, {
					request: dataPlaneRequest,
				}),
			);

			toast.success(`Secret "${data.name}" created successfully`);

			// Select the newly created secret
			onChange(data.name);

			// Call callback if provided
			onSecretCreated?.(data.name);

			// Close dialog and reset form
			setIsCreateDialogOpen(false);
			form.reset();
		} catch (error) {
			const errorMessage = formatToastErrorMessageGRPC({
				error: error as ConnectError,
				action: "create",
				entity: `secret ${data.name}`,
			});
			toast.error(errorMessage);
		}
	};

	return (
		<>
			{availableSecrets.length === 0 ? (
				// No secrets available - show empty state
				<div className="flex flex-col items-center justify-center rounded-lg border-2 border-muted border-dashed bg-muted/10 py-12">
					<KeyRound className="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
					<Text className="mb-2 font-medium">No secrets available</Text>
					<Text className="mb-4 text-center" variant="muted">
						{customText.emptyStateDescription}
					</Text>
					<Button
						onClick={() => setIsCreateDialogOpen(true)}
						type="button"
						variant="outline"
					>
						<div className="flex items-center gap-2">
							<Plus className="h-4 w-4" />
							<Text as="span">Create secret</Text>
						</div>
					</Button>
				</div>
			) : (
				// Secrets available - show combobox with create button
				<div className="flex items-center gap-2">
					<Select onValueChange={onChange} value={value}>
						<SelectTrigger className="flex-1">
							<SelectValue placeholder={placeholder} />
						</SelectTrigger>
						<SelectContent>
							{availableSecrets.map((secret) => (
								<SelectItem key={secret.id} value={secret.id}>
									{secret.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						onClick={() => setIsCreateDialogOpen(true)}
						type="button"
						variant="outline"
					>
						<div className="flex items-center gap-2">
							<Plus className="h-4 w-4" />
							<Text as="span">Create secret</Text>
						</div>
					</Button>
				</div>
			)}

			<Dialog onOpenChange={setIsCreateDialogOpen} open={isCreateDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create new secret</DialogTitle>
						<DialogDescription>
							{customText.dialogDescription}
						</DialogDescription>
					</DialogHeader>

					<Form {...form}>
						<form
							className="space-y-4"
							onSubmit={(e) => {
								e.stopPropagation();
								form.handleSubmit(handleCreateSecret)(e);
							}}
						>
							<Field data-invalid={!!form.formState.errors.name}>
								<FieldLabel htmlFor="secret-name">Secret name</FieldLabel>
								<Input
									id="secret-name"
									placeholder={customText.secretNamePlaceholder}
									{...form.register("name")}
									onChange={(e) =>
										form.setValue("name", e.target.value.toUpperCase())
									}
								/>
								<FieldDescription>
									Secrets are stored in uppercase
								</FieldDescription>
								{form.formState.errors.name && (
									<FieldError>{form.formState.errors.name.message}</FieldError>
								)}
							</Field>

							<Field data-invalid={!!form.formState.errors.value}>
								<FieldLabel htmlFor="secret-value">Secret value</FieldLabel>
								<Input
									id="secret-value"
									placeholder={customText.secretValuePlaceholder}
									type="password"
									{...form.register("value")}
								/>
								<FieldDescription>
									{customText.secretValueDescription}
								</FieldDescription>
								{form.formState.errors.value && (
									<FieldError>{form.formState.errors.value.message}</FieldError>
								)}
							</Field>

							<DialogFooter>
								<Button
									onClick={() => setIsCreateDialogOpen(false)}
									type="button"
									variant="outline"
								>
									Cancel
								</Button>
								<Button
									disabled={isCreateSecretPending || !form.formState.isValid}
									type="submit"
								>
									{isCreateSecretPending ? (
										<div className="flex items-center gap-2">
											<Loader2 className="h-4 w-4 animate-spin" />
											<Text as="span">Creating...</Text>
										</div>
									) : (
										"Create Secret"
									)}
								</Button>
							</DialogFooter>
						</form>
					</Form>
				</DialogContent>
			</Dialog>
		</>
	);
};
