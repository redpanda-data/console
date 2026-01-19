"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { isFeatureFlagEnabled } from "config";
import { Slot as SlotPrimitive } from "radix-ui";
import React, { type ElementType } from "react";
import { cn, type SharedProps } from "../lib/utils";
import { useGroup } from "./group";

const buttonVariants = (isNewThemeEnabled?: boolean) =>
	cva(
		[
			// Base layout (from Figma: display: inline-flex, justify-content: center, align-items: center)
			"inline-flex items-center justify-center",
			// Typography
			"whitespace-nowrap font-semibold transition-all",
			// Cursor
			"cursor-pointer",
			// Disabled state
			"disabled:pointer-events-none disabled:cursor-not-allowed",
			// Icon styles
			"shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
			// Focus ring
			"outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
			// Selection
			"selection:bg-selected selection:text-selected-foreground",
			// Active/Pressed state base
			"active:scale-[0.98]",
		],
		{
			variants: {
				variant: {
					primary: isNewThemeEnabled
						? [
								"bg-surface-primary text-inverse shadow-xs",
								"hover:bg-surface-primary-hover",
								"active:bg-surface-primary-pressed",
								"disabled:bg-background-disabled disabled:text-disabled",
							]
						: [
								"bg-surface-neutral-dark text-inverse shadow-xs",
								"hover:bg-surface-neutral-dark-hover",
								"active:bg-surface-neutral-dark-pressed",
								"disabled:bg-background-disabled disabled:text-disabled",
							],
					secondary: [
						"bg-surface-neutral-dark text-inverse shadow-xs",
						"hover:bg-surface-neutral-dark-hover",
						"active:bg-surface-neutral-dark-pressed",
						"disabled:bg-background-disabled disabled:text-disabled",
					],
					accent: [
						"bg-brand text-brand-foreground shadow-xs",
						"hover:bg-surface-brand-hover",
						"active:bg-surface-brand-pressed",
						"disabled:bg-background-disabled disabled:text-disabled",
					],
					destructive: [
						"bg-destructive text-destructive-foreground shadow-xs",
						"hover:bg-surface-error-hover",
						"active:bg-surface-error-pressed",
						"focus-visible:ring-destructive",
						"disabled:bg-background-disabled disabled:text-disabled",
					],
					inverse: [
						"bg-surface-inverse text-secondary shadow-xs",
						"hover:bg-surface-inverse-hover",
						"active:bg-surface-inverse-pressed",
						"disabled:bg-surface-inverse-disabled disabled:text-disabled",
					],
					outline: [
						"!border-outline-primary border text-primary-inverse shadow-xs",
						"hover:border-outline-primary-hover hover:bg-primary-alpha-subtle",
						"active:border-outline-primary-pressed active:bg-primary-alpha-subtle-default",
						"disabled:border-outline-inverse-disabled disabled:text-disabled",
					],
					"secondary-outline": [
						"!border-outline-inverse border text-secondary shadow-xs",
						"hover:border-outline-hover hover:bg-secondary-alpha-subtle",
						"active:border-outline-pressed active:bg-secondary-alpha-default",
						"disabled:border-outline-inverse-disabled disabled:text-disabled",
					],
					"accent-outline": [
						"border border-brand bg-transparent text-brand shadow-xs",
						"hover:border-outline-brand-hover hover:bg-brand-alpha-subtle",
						"active:border-outline-brand-pressed active:bg-brand-alpha-default",
						"disabled:border-border disabled:text-disabled",
					],
					"destructive-outline": [
						"border border-destructive bg-transparent text-destructive shadow-xs",
						"hover:border-outline-error-hover hover:bg-destructive-alpha-subtle",
						"active:border-outline-error-pressed active:bg-destructive-alpha-default",
						"focus-visible:ring-destructive",
						"disabled:border-border disabled:text-disabled",
					],
					"inverse-outline": [
						"border border-inverse-primary bg-transparent text-inverse-primary shadow-xs",
						"hover:border-transparent hover:bg-light-alpha-strong",
						"active:border-transparent active:bg-light-alpha-stronger",
						"disabled:border-inverse-disabled disabled:text-inverse-disabled",
					],
					ghost: [
						"bg-transparent text-action-primary",
						"hover:bg-surface-primary-subtle",
						"active:bg-surface-primary-subtle-hover",
						"disabled:text-disabled",
					],
					"secondary-ghost": [
						"bg-transparent text-secondary",
						"hover:bg-surface-secondary-subtle",
						"active:bg-surface-secondary-subtle-hover",
						"disabled:text-disabled",
					],
					"accent-ghost": [
						"bg-transparent text-brand",
						"hover:bg-surface-brand-subtle hover:text-brand",
						"active:bg-surface-brand-subtle-hover",
						"disabled:text-disabled",
					],
					"destructive-ghost": [
						"bg-transparent text-destructive",
						"hover:bg-background-error-subtle hover:text-destructive",
						"active:bg-destructive-subtle",
						"focus-visible:ring-destructive",
						"disabled:text-disabled",
					],
					"inverse-ghost": [
						"bg-transparent text-inverse-primary",
						"hover:bg-light-alpha-strong",
						"active:bg-light-alpha-stronger",
						"disabled:text-inverse-disabled",
					],
					// Link variant
					link: [
						"text-primary underline-offset-4",
						"hover:text-primary/80 hover:underline",
						"active:text-primary/60",
						"disabled:text-disabled disabled:no-underline",
					],
					// Dashed border variant
					dashed: [
						"border-2 border-primary border-dashed bg-transparent text-primary",
						"hover:border-primary/80 hover:bg-primary/5",
						"active:bg-primary/10",
						"disabled:border-border disabled:text-disabled",
					],
				},
				size: {
					// XS: height 24px, padding 0 8px, gap 4px, font 12px (from Figma)
					xs: "h-6 gap-1 px-2 py-0 text-xs has-[>svg]:px-1.5",
					// SM: height 32px, padding 0 12px, gap 8px, font 12px (from Figma)
					sm: "h-8 gap-2 px-3 py-0 text-xs has-[>svg]:px-2.5",
					// MD (default): height 40px, padding 0 16px, gap 8px, font 14px (from Figma)
					md: "h-10 gap-2 px-4 py-0 text-sm has-[>svg]:px-3",
					// LG: height 48px, padding 0 24px, gap 8px, font 16px (from Figma)
					lg: "h-12 gap-2 px-6 py-0 text-base has-[>svg]:px-4",
					// Icon sizes
					icon: "size-10",
					"icon-xs": "size-6",
					"icon-sm": "size-8",
					"icon-lg": "size-12",
				},
			},
			defaultVariants: {
				variant: "primary",
				size: "md",
			},
		},
	);

export type ButtonVariants = VariantProps<ReturnType<typeof buttonVariants>>;

const Button = React.forwardRef<
	HTMLButtonElement,
	React.ComponentProps<"button"> &
		ButtonVariants &
		SharedProps & {
			asChild?: boolean;
			as?: ElementType;
			to?: string;
		}
>(
	(
		{ className, variant, size, asChild = false, testId, as, to, ...props },
		ref,
	) => {
		const Comp = as ?? (asChild ? SlotPrimitive.Slot : "button");
		const isNewThemeEnabled = isFeatureFlagEnabled("enableNewTheme");
		const { attached, position } = useGroup();

		let positionClasses = "rounded-md";
		if (attached && position === "first") {
			positionClasses = "rounded-r-none rounded-l-md border-r-0";
		} else if (attached && position === "last") {
			positionClasses = "rounded-r-md rounded-l-none border-l-0";
		} else if (attached && position === "middle") {
			positionClasses = "rounded-none border-r-0 border-l-0";
		}

		return (
			<Comp
				className={cn(
					buttonVariants(isNewThemeEnabled)({ variant, size, className }),
					positionClasses,
					className,
				)}
				data-slot="button"
				data-testid={testId}
				ref={ref}
				to={to}
				{...props}
			/>
		);
	},
);

Button.displayName = "Button";

export { Button, buttonVariants };
