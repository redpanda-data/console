import { cva, type VariantProps } from "class-variance-authority";
import { InfoIcon } from "lucide-react";
import React from "react";

import { cn, type SharedProps } from "../lib/utils";

const alertVariants = cva(
	"relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
	{
		variants: {
			variant: {
				info: "bg-card text-card-foreground",
				destructive:
					"text-destructive bg-destructive/10 [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90 !border-destructive/20 [&>href]:text-current",
				warning:
					"bg-blue-50 text-blue-800 [&>svg]:text-current *:data-[slot=alert-description]:text-blue-800 !border-blue-200 [&>href]:text-current",
				success:
					"bg-green-50 text-green-800 [&>svg]:text-current *:data-[slot=alert-description]:text-green-800 !border-green-200 [&>href]:text-current dark:bg-green-950/30 dark:text-green-300 dark:*:data-[slot=alert-description]:text-green-300 dark:!border-green-800/40",
			},
		},
		defaultVariants: {
			variant: "info",
		},
	},
);

const Alert = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<"div"> &
		VariantProps<typeof alertVariants> &
		SharedProps & { icon?: React.ReactNode }
>(
	(
		{ className, variant, testId, icon = <InfoIcon />, children, ...props },
		ref,
	) => (
		<div
			className={cn(alertVariants({ variant }), className)}
			data-slot="alert"
			data-testid={testId}
			ref={ref}
			role="alert"
			{...props}
		>
			{icon}
			{children}
		</div>
	),
);

Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<"div"> & SharedProps
>(({ className, testId, ...props }, ref) => (
	<div
		className={cn(
			"col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight",
			className,
		)}
		data-slot="alert-title"
		data-testid={testId}
		ref={ref}
		{...props}
	/>
));

AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<"div"> & SharedProps
>(({ className, testId, ...props }, ref) => (
	<div
		className={cn(
			"col-start-2 grid justify-items-start gap-1 text-muted-foreground text-sm [&_p]:leading-relaxed",
			className,
		)}
		data-slot="alert-description"
		data-testid={testId}
		ref={ref}
		{...props}
	/>
));

AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
