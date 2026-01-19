"use client";

import { isFeatureFlagEnabled } from "config";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import type React from "react";
import { cn } from "../lib/utils";
import { buttonVariants } from "./button";

function AlertDialog({
	testId,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root> & {
	testId?: string;
}) {
	return (
		<AlertDialogPrimitive.Root
			data-slot="alert-dialog"
			data-testid={testId}
			{...props}
		/>
	);
}

function AlertDialogTrigger({
	testId,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger> & {
	testId?: string;
}) {
	return (
		<AlertDialogPrimitive.Trigger
			data-slot="alert-dialog-trigger"
			data-testid={testId}
			{...props}
		/>
	);
}

function AlertDialogPortal({
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
	return (
		<AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
	);
}

function AlertDialogOverlay({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
	return (
		<AlertDialogPrimitive.Overlay
			data-slot="alert-dialog-overlay"
			className={cn(
				"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
				className,
			)}
			{...props}
		/>
	);
}

function AlertDialogContent({
	className,
	testId,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
	testId?: string;
}) {
	return (
		<AlertDialogPortal>
			<AlertDialogOverlay />
			<AlertDialogPrimitive.Content
				data-slot="alert-dialog-content"
				data-testid={testId}
				className={cn(
					"bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
					className,
				)}
				{...props}
			/>
		</AlertDialogPortal>
	);
}

function AlertDialogHeader({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-dialog-header"
			className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
			{...props}
		/>
	);
}

function AlertDialogFooter({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-dialog-footer"
			className={cn(
				"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
				className,
			)}
			{...props}
		/>
	);
}

function AlertDialogTitle({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
	return (
		<AlertDialogPrimitive.Title
			data-slot="alert-dialog-title"
			className={cn("text-lg font-semibold", className)}
			{...props}
		/>
	);
}

function AlertDialogDescription({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
	return (
		<AlertDialogPrimitive.Description
			data-slot="alert-dialog-description"
			className={cn("text-muted-foreground text-sm", className)}
			{...props}
		/>
	);
}

function AlertDialogAction({
	className,
	testId,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
	testId?: string;
}) {
	return (
		<AlertDialogPrimitive.Action
			className={cn(buttonVariants(), className)}
			data-testid={testId}
			{...props}
		/>
	);
}

function AlertDialogCancel({
	className,
	testId,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> & {
	testId?: string;
}) {
	const isNewThemeEnabled = isFeatureFlagEnabled("enableNewTheme");
	return (
		<AlertDialogPrimitive.Cancel
			className={cn(
				buttonVariants(isNewThemeEnabled)({ variant: "outline" }),
				className,
			)}
			data-testid={testId}
			{...props}
		/>
	);
}

export {
	AlertDialog,
	AlertDialogPortal,
	AlertDialogOverlay,
	AlertDialogTrigger,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogFooter,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogAction,
	AlertDialogCancel,
};
