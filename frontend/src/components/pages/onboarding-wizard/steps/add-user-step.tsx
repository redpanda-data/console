import { create } from "@bufbuild/protobuf";
import { zodResolver } from "@hookform/resolvers/zod";
import { generatePassword } from "components/pages/acls/UserCreate";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "components/redpanda-ui/components/alert";
import { Button } from "components/redpanda-ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "components/redpanda-ui/components/card";
import { Checkbox } from "components/redpanda-ui/components/checkbox";
import {
	Combobox,
	type ComboboxOption,
} from "components/redpanda-ui/components/combobox";
import { CopyButton } from "components/redpanda-ui/components/copy-button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "components/redpanda-ui/components/form";
import { Group } from "components/redpanda-ui/components/group";
import { Input } from "components/redpanda-ui/components/input";
import { Label } from "components/redpanda-ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "components/redpanda-ui/components/select";
import { Heading } from "components/redpanda-ui/components/typography";
import { CircleAlert, RefreshCcw } from "lucide-react";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useMemo,
	useState,
} from "react";
import { useForm } from "react-hook-form";
import { CreateACLRequestSchema } from "../../../../protogen/redpanda/api/dataplane/v1/acl_pb";
import {
	CreateUserRequestSchema,
	type ListUsersResponse_User,
} from "../../../../protogen/redpanda/api/dataplane/v1/user_pb";
import { useLegacyCreateACLMutation } from "../../../../react-query/api/acl";
import { useCreateUserMutation } from "../../../../react-query/api/user";
import {
	useAddTopicFormData,
	useAddUserFormData,
} from "../../../../state/onboarding-wizard/state";
import type { StepSubmissionResult } from "../types";
import {
	type AddUserFormData,
	addUserFormSchema,
	saslMechanisms,
} from "../types/forms";
import { createTopicSuperuserACLs, saslMechanismToProto } from "../utils/user";

export interface AddUserStepRef {
	triggerSubmit: () => Promise<StepSubmissionResult>;
	isLoading: boolean;
}

interface AddUserStepProps {
	usersList: ListUsersResponse_User[];
}

export const AddUserStep = forwardRef<AddUserStepRef, AddUserStepProps>(
	({ usersList }, ref) => {
		const [specialCharactersEnabled, setSpecialCharactersEnabled] =
			useState<boolean>(false);
		const [password, setPassword] = useState<string>(
			generatePassword(30, false),
		);
		const [userOptions, setUserOptions] = useState<ComboboxOption[]>(
			usersList.map((user) => ({
				value: user.name || "",
				label: user.name || "",
			})),
		);

		const { data: persistedUserData, setData: setUserFormData } =
			useAddUserFormData();
		const { data: topicData } = useAddTopicFormData();
		const createUserMutation = useCreateUserMutation();
		const createACLMutation = useLegacyCreateACLMutation();

		const form = useForm<AddUserFormData>({
			resolver: zodResolver(addUserFormSchema),
			mode: "onChange",
			defaultValues: {
				username: persistedUserData?.username || "",
				password: persistedUserData?.password || password,
				saslMechanism: persistedUserData?.saslMechanism || "SCRAM-SHA-256",
				superuser: persistedUserData?.superuser ?? true,
			},
		});

		const watchedUsername = form.watch("username");
		const matchingUserNameForFormValue = useMemo(
			() => usersList?.find((user) => user.name === watchedUsername)?.name,
			[usersList, watchedUsername],
		);
		const persistedUsername = useMemo(
			() => persistedUserData?.username,
			[persistedUserData],
		);

		const existingUserBeingEdited = useMemo(() => {
			const getUserName =
				matchingUserNameForFormValue ?? persistedUsername ?? undefined;
			return usersList?.find((user) => user.name === getUserName);
		}, [persistedUsername, matchingUserNameForFormValue, usersList]);

		useEffect(() => {
			const currentPassword = form.getValues("password");
			if (currentPassword !== password) {
				form.setValue("password", password, { shouldDirty: false });
			}
		}, [password, form]);

		useEffect(() => {
			if (existingUserBeingEdited) {
				form.setValue("username", existingUserBeingEdited.name || "", {
					shouldDirty: false,
				});
			}
		}, [existingUserBeingEdited, form]);

		const handleSubmit = async (
			userData: AddUserFormData,
		): Promise<StepSubmissionResult> => {
			try {
				setUserFormData(userData);

				if (existingUserBeingEdited) {
					return {
						success: true,
						message: `Using existing user "${userData.username}"`,
					};
				} else {
					const createUserRequest = create(CreateUserRequestSchema, {
						user: {
							name: userData.username,
							password: userData.password,
							mechanism: saslMechanismToProto(userData.saslMechanism),
						},
					});

					await createUserMutation.mutateAsync(createUserRequest);

					if (topicData?.topicName && userData.superuser) {
						const aclConfigs = createTopicSuperuserACLs(
							topicData.topicName,
							userData.username,
						);

						for (const config of aclConfigs) {
							const aclRequest = create(CreateACLRequestSchema, config);
							await createACLMutation.mutateAsync(aclRequest);
						}
					}

					return {
						success: true,
						message: `Created user "${userData.username}" successfully!${
							topicData?.topicName && userData.superuser
								? ` with permissions for topic "${topicData.topicName}"`
								: ""
						}`,
					};
				}
			} catch (error) {
				return {
					success: false,
					message: "Failed to create user or configure permissions",
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		};

		useImperativeHandle(ref, () => ({
			triggerSubmit: async () => {
				const isUserFormValid = await form.trigger();

				if (isUserFormValid) {
					const userData = form.getValues();
					return handleSubmit(userData);
				}
				return {
					success: false,
					message: "Please fix the form errors before proceeding",
					error: "Form validation failed",
				};
			},
			isLoading: createUserMutation.isPending || createACLMutation.isPending,
		}));

		return (
			<Card size="full">
				<CardHeader>
					<CardTitle>
						<Heading level={2}>Select a user</Heading>
					</CardTitle>
					<CardDescription>
						A Kafka user represents an application, service, or human identity
						that interacts with a cluster, either to produce data, consume data,
						or perform administrative tasks. Kafka uses Access Control Lists
						(ACLs) to manage what each user is allowed to do, providing
						fine-grained security and preventing unauthorized access.
					</CardDescription>
					{existingUserBeingEdited && (
						<Alert variant="destructive">
							<AlertTitle className="flex gap-2 items-center">
								<CircleAlert size={15} />
								Heads up!
							</AlertTitle>
							<AlertDescription>
								You've selected an existing user "{existingUserBeingEdited.name}
								" any changes you make will update the existing user
								configurations.
							</AlertDescription>
						</Alert>
					)}
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<div className="space-y-8">
							<FormField
								control={form.control}
								name="username"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Username</FormLabel>
										<FormControl>
											<Combobox
												{...field}
												options={userOptions}
												creatable
												onCreateOption={(value) => {
													setUserOptions((prev) => [
														...prev,
														{ value, label: value },
													]);
												}}
												placeholder="Select or create a user..."
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="password"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Password</FormLabel>
										<FormControl>
											<Group>
												<Input type="password" {...field} />
												<CopyButton
													size="icon"
													content={password}
													variant="outline"
												/>
												<Button
													type="button"
													size="icon"
													variant="outline"
													onClick={() =>
														setPassword(
															generatePassword(30, specialCharactersEnabled),
														)
													}
												>
													<RefreshCcw size={15} />
												</Button>
											</Group>
										</FormControl>
										<FormMessage />
										<Label className="flex-row items-center text-muted-foreground font-normal">
											<Checkbox
												defaultChecked={specialCharactersEnabled}
												onCheckedChange={(val) => {
													setSpecialCharactersEnabled(
														val === "indeterminate" ? false : val,
													);
													setPassword(
														generatePassword(
															30,
															val === "indeterminate" ? false : val,
														),
													);
												}}
											/>
											Generate with special characters
										</Label>
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="saslMechanism"
								render={({ field }) => (
									<FormItem>
										<FormLabel>SASL Mechanism</FormLabel>
										<FormControl>
											<Select {...field}>
												<SelectTrigger>
													<SelectValue placeholder="Select a SASL Mechanism" />
												</SelectTrigger>
												<SelectContent>
													{saslMechanisms.map((mechanism) => (
														<SelectItem key={mechanism} value={mechanism}>
															{mechanism}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{topicData?.topicName && (
								<FormField
									control={form.control}
									name="superuser"
									render={({ field }) => (
										<FormItem>
											<div className="flex flex-col gap-2">
												<div className="flex items-center space-x-3">
													<FormControl>
														<Checkbox
															checked={field.value}
															onCheckedChange={field.onChange}
														/>
													</FormControl>
													<FormLabel className="text-sm font-medium">
														Enable topic-specific permissions for this user for
														"{topicData.topicName}"
													</FormLabel>
												</div>
												<p className="text-sm text-muted-foreground">
													{field.value ? (
														`This user will have full permissions (read, write, create, delete, describe, alter) on the selected topic "${topicData.topicName}".`
													) : (
														<Alert variant="destructive">
															<AlertTitle className="flex gap-2 items-center">
																<CircleAlert size={15} />
																Want custom User Permissions?
															</AlertTitle>
															<AlertDescription>
																You can configure custom ACLs to connect your
																data to Redpanda{" "}
																<a
																	href="/security/acls"
																	className="text-blue-600 hover:text-blue-800 underline"
																	target="_blank"
																	rel="noopener noreferrer"
																>
																	here
																</a>
															</AlertDescription>
														</Alert>
													)}
												</p>

												<FormMessage />
											</div>
										</FormItem>
									)}
								/>
							)}
						</div>
					</Form>
				</CardContent>
			</Card>
		);
	},
);
