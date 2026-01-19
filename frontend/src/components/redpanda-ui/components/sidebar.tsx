"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeftIcon } from "lucide-react";
import type { Transition } from "motion/react";
import { Slot as SlotPrimitive } from "radix-ui";
import React from "react";
import { useIsMobile } from "../lib/use-mobile";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Input } from "./input";
import { MotionHighlight, MotionHighlightItem } from "./motion-highlight";
import { Separator } from "./separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "./sheet";
import { Skeleton } from "./skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./tooltip";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContextProps = {
	state: "expanded" | "collapsed";
	open: boolean;
	setOpen: (open: boolean) => void;
	openMobile: boolean;
	setOpenMobile: (open: boolean) => void;
	isMobile: boolean;
	toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
	const context = React.useContext(SidebarContext);
	if (!context) {
		throw new Error("useSidebar must be used within a SidebarProvider.");
	}

	return context;
}

type SidebarProviderProps = React.ComponentProps<"div"> & {
	defaultOpen?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	isSuspended?: boolean;
};

function SidebarProvider({
	defaultOpen = true,
	open: openProp,
	onOpenChange: setOpenProp,
	isSuspended = false,
	className,
	style,
	children,
	...props
}: SidebarProviderProps) {
	const isMobile = useIsMobile();
	const [openMobile, setOpenMobile] = React.useState(false);

	// Read the initial state from the cookie if available
	const getInitialOpen = () => {
		if (typeof document === "undefined") return defaultOpen;
		const cookies = document.cookie.split(";");
		for (const cookie of cookies) {
			const [name, value] = cookie.trim().split("=");
			if (name === SIDEBAR_COOKIE_NAME) {
				return value === "true";
			}
		}
		return defaultOpen;
	};

	// This is the internal state of the sidebar.
	// We use openProp and setOpenProp for control from outside the component.
	const [_open, _setOpen] = React.useState(getInitialOpen);
	const open = openProp ?? _open;
	const setOpen = React.useCallback(
		(newValue: boolean | ((currentValue: boolean) => boolean)) => {
			const openState =
				typeof newValue === "function" ? newValue(open) : newValue;
			if (setOpenProp) {
				setOpenProp(openState);
			} else {
				_setOpen(openState);
			}

			// This sets the cookie to keep the sidebar state.
			// biome-ignore lint/suspicious/noDocumentCookie: part of sidebar implementation
			document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
		},
		[setOpenProp, open],
	);

	// Helper to toggle the sidebar.
	// biome-ignore lint/correctness/useExhaustiveDependencies: part of sidebar implementation
	const toggleSidebar = React.useCallback(
		() =>
			isMobile
				? setOpenMobile((isOpen) => !isOpen)
				: setOpen((isOpen) => !isOpen),
		[isMobile, setOpen, setOpenMobile],
	);

	// Adds a keyboard shortcut to toggle the sidebar.
	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
				(event.metaKey || event.ctrlKey)
			) {
				event.preventDefault();
				toggleSidebar();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [toggleSidebar]);

	// We add a state so that we can do data-state="expanded" or "collapsed".
	// This makes it easier to style the sidebar with Tailwind classes.
	const state = open ? "expanded" : "collapsed";

	// biome-ignore lint/correctness/useExhaustiveDependencies: part of sidebar implementation
	const contextValue = React.useMemo<SidebarContextProps>(
		() => ({
			state,
			open,
			setOpen,
			isMobile,
			openMobile,
			setOpenMobile,
			toggleSidebar,
		}),
		[state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar],
	);

	return (
		<SidebarContext.Provider value={contextValue}>
			<TooltipProvider delayDuration={0}>
				<div
					className={cn(
						"group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
						isSuspended &&
							"[&_[data-slot=sidebar-container]]:top-10 [&_[data-slot=sidebar-container]]:h-[calc(100svh-40px)] [&_[data-slot=sidebar-gap]]:mt-10 [&_[data-slot=sidebar-inset]]:mt-10",
						className,
					)}
					data-slot="sidebar-wrapper"
					style={
						{
							"--sidebar-width": SIDEBAR_WIDTH,
							"--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
							...style,
						} as React.CSSProperties
					}
					{...props}
				>
					{children}
				</div>
			</TooltipProvider>
		</SidebarContext.Provider>
	);
}

type SidebarProps = React.ComponentProps<"div"> & {
	side?: "left" | "right";
	variant?: "sidebar" | "floating" | "inset";
	collapsible?: "offcanvas" | "icon" | "none";
	containerClassName?: string;
	animateOnHover?: boolean;
	transition?: Transition;
};

function Sidebar({
	side = "left",
	variant = "sidebar",
	collapsible = "offcanvas",
	className,
	children,
	animateOnHover = true,
	containerClassName,
	transition = { type: "spring", stiffness: 350, damping: 35 },
	...props
}: SidebarProps) {
	const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

	if (collapsible === "none") {
		return (
			<MotionHighlight
				containerClassName={containerClassName}
				controlledItems
				enabled={animateOnHover}
				hover
				mode="parent"
				transition={transition}
			>
				<div
					className={cn(
						"flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
						className,
					)}
					data-slot="sidebar"
					{...props}
				>
					{children}
				</div>
			</MotionHighlight>
		);
	}

	if (isMobile) {
		return (
			<Sheet onOpenChange={setOpenMobile} open={openMobile} {...props}>
				<SheetContent
					className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
					data-mobile="true"
					data-sidebar="sidebar"
					data-slot="sidebar"
					side={side}
					style={
						{
							"--sidebar-width": SIDEBAR_WIDTH_MOBILE,
						} as React.CSSProperties
					}
				>
					<SheetHeader className="sr-only">
						<SheetTitle>Sidebar</SheetTitle>
						<SheetDescription>Displays the mobile sidebar.</SheetDescription>
					</SheetHeader>
					<MotionHighlight
						containerClassName={cn("h-full", containerClassName)}
						controlledItems
						enabled={animateOnHover}
						hover
						mode="parent"
						transition={transition}
					>
						<div className="flex h-full w-full flex-col">{children}</div>
					</MotionHighlight>
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<div
			className="group peer max-md:hidden text-sidebar-foreground"
			data-collapsible={state === "collapsed" ? collapsible : ""}
			data-side={side}
			data-slot="sidebar"
			data-state={state}
			data-variant={variant}
		>
			{/* This is what handles the sidebar gap on desktop */}
			<div
				className={cn(
					"relative w-(--sidebar-width) bg-transparent transition-[width] duration-400 ease-[cubic-bezier(0.7,-0.15,0.25,1.15)]",
					"group-data-[collapsible=offcanvas]:w-0",
					"group-data-[side=right]:rotate-180",
					variant === "floating" || variant === "inset"
						? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
						: "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
				)}
				data-slot="sidebar-gap"
			/>
			<div
				className={cn(
					"fixed inset-y-0 z-10 flex max-md:hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)]",
					side === "left"
						? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
						: "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
					// Adjust the padding for floating and inset variants.
					variant === "floating" || variant === "inset"
						? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
						: "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
					className,
				)}
				data-slot="sidebar-container"
				{...props}
			>
				<MotionHighlight
					containerClassName={cn("size-full", containerClassName)}
					controlledItems
					enabled={animateOnHover}
					forceUpdateBounds
					hover
					mode="parent"
					transition={transition}
				>
					<div
						className="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow-sm"
						data-sidebar="sidebar"
						data-slot="sidebar-inner"
					>
						{children}
					</div>
				</MotionHighlight>
			</div>
		</div>
	);
}

type SidebarTriggerProps = React.ComponentProps<typeof Button>;

function SidebarTrigger({ className, onClick, ...props }: SidebarTriggerProps) {
	const { toggleSidebar } = useSidebar();

	return (
		<Button
			className={cn("size-7", className)}
			data-sidebar="trigger"
			data-slot="sidebar-trigger"
			onClick={(event) => {
				onClick?.(event);
				toggleSidebar();
			}}
			size="icon"
			variant="ghost"
			{...props}
		>
			<PanelLeftIcon />
			<span className="sr-only">Toggle Sidebar</span>
		</Button>
	);
}

type SidebarRailProps = React.ComponentProps<"button">;

function SidebarRail({ className, ...props }: SidebarRailProps) {
	const { toggleSidebar } = useSidebar();

	return (
		<button
			aria-label="Toggle Sidebar"
			className={cn(
				"absolute inset-y-0 z-20 flex max-sm:hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=left]:-right-4 group-data-[side=right]:left-0",
				"in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
				"[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
				"group-data-[collapsible=offcanvas]:translate-x-0 hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:after:left-full",
				"[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
				"[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
				className,
			)}
			data-sidebar="rail"
			data-slot="sidebar-rail"
			onClick={toggleSidebar}
			tabIndex={-1}
			title="Toggle Sidebar"
			{...props}
		/>
	);
}

type SidebarInsetProps = React.ComponentProps<"main">;

function SidebarInset({ className, ...props }: SidebarInsetProps) {
	return (
		<main
			className={cn(
				"relative flex w-full flex-1 flex-col bg-background",
				"md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2 md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm",
				className,
			)}
			data-slot="sidebar-inset"
			{...props}
		/>
	);
}

type SidebarInputProps = React.ComponentProps<typeof Input>;

function SidebarInput({ className, ...props }: SidebarInputProps) {
	return (
		<Input
			className={cn("h-8 w-full bg-background shadow-none", className)}
			data-sidebar="input"
			data-slot="sidebar-input"
			{...props}
		/>
	);
}

type SidebarHeaderProps = React.ComponentProps<"div">;

function SidebarHeader({ className, ...props }: SidebarHeaderProps) {
	return (
		<div
			className={cn(
				"flex flex-col gap-2 p-2 group-data-[collapsible=icon]:items-center",
				className,
			)}
			data-sidebar="header"
			data-slot="sidebar-header"
			{...props}
		/>
	);
}

type SidebarFooterProps = React.ComponentProps<"div">;

function SidebarFooter({ className, ...props }: SidebarFooterProps) {
	return (
		<div
			className={cn(
				"flex flex-col gap-2 p-2 group-data-[collapsible=icon]:items-center",
				className,
			)}
			data-sidebar="footer"
			data-slot="sidebar-footer"
			{...props}
		/>
	);
}

type SidebarSeparatorProps = React.ComponentProps<typeof Separator>;

function SidebarSeparator({ className, ...props }: SidebarSeparatorProps) {
	return (
		<Separator
			className={cn("mx-2 w-auto bg-sidebar-border", className)}
			data-sidebar="separator"
			data-slot="sidebar-separator"
			{...props}
		/>
	);
}

type SidebarContentProps = React.ComponentProps<"div">;

function SidebarContent({ className, ...props }: SidebarContentProps) {
	return (
		<div
			className={cn(
				"flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
				className,
			)}
			data-sidebar="content"
			data-slot="sidebar-content"
			{...props}
		/>
	);
}

type SidebarGroupProps = React.ComponentProps<"div">;

function SidebarGroup({ className, ...props }: SidebarGroupProps) {
	return (
		<div
			className={cn(
				"relative flex w-full min-w-0 flex-col p-2 group-data-[collapsible=icon]:items-center",
				className,
			)}
			data-sidebar="group"
			data-slot="sidebar-group"
			{...props}
		/>
	);
}

type SidebarGroupLabelProps = React.ComponentProps<"div"> & {
	asChild?: boolean;
};

const SidebarGroupLabel = React.forwardRef<
	HTMLDivElement,
	SidebarGroupLabelProps
>(({ className, asChild = false, ...props }, ref) => {
	const Comp = asChild ? SlotPrimitive.Slot : "div";

	return (
		<Comp
			className={cn(
				"flex h-8 shrink-0 items-center rounded-md px-2 font-normal text-sidebar-foreground/50 text-xs uppercase tracking-wider outline-hidden ring-sidebar-ring transition-[margin,opacity] duration-300 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
				"group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
				className,
			)}
			data-sidebar="group-label"
			data-slot="sidebar-group-label"
			ref={ref}
			{...props}
		/>
	);
});

SidebarGroupLabel.displayName = "SidebarGroupLabel";

type SidebarGroupActionProps = React.ComponentProps<"button"> & {
	asChild?: boolean;
};

const SidebarGroupAction = React.forwardRef<
	HTMLButtonElement,
	SidebarGroupActionProps
>(({ className, asChild = false, ...props }, ref) => {
	const Comp = asChild ? SlotPrimitive.Slot : "button";

	return (
		<Comp
			className={cn(
				"absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-hidden ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
				// Increases the hit area of the button on mobile.
				"after:absolute after:-inset-2 md:after:hidden",
				"group-data-[collapsible=icon]:hidden",
				className,
			)}
			data-sidebar="group-action"
			data-slot="sidebar-group-action"
			ref={ref}
			{...props}
		/>
	);
});

SidebarGroupAction.displayName = "SidebarGroupAction";

type SidebarGroupContentProps = React.ComponentProps<"div">;

function SidebarGroupContent({
	className,
	...props
}: SidebarGroupContentProps) {
	return (
		<div
			className={cn("w-full text-sm", className)}
			data-sidebar="group-content"
			data-slot="sidebar-group-content"
			{...props}
		/>
	);
}

type SidebarMenuProps = React.ComponentProps<"ul">;

function SidebarMenu({ className, ...props }: SidebarMenuProps) {
	return (
		<ul
			className={cn(
				"flex w-full min-w-0 flex-col gap-1 group-data-[collapsible=icon]:items-center",
				className,
			)}
			data-sidebar="menu"
			data-slot="sidebar-menu"
			{...props}
		/>
	);
}

type SidebarMenuItemProps = React.ComponentProps<"li">;

function SidebarMenuItem({ className, ...props }: SidebarMenuItemProps) {
	return (
		<li
			className={cn(
				"group/menu-item relative group-data-[collapsible=icon]:w-auto",
				className,
			)}
			data-sidebar="menu-item"
			data-slot="sidebar-menu-item"
			{...props}
		/>
	);
}

const sidebarMenuButtonActiveVariants = cva(
	"rounded-md bg-sidebar-accent text-sidebar-accent-foreground",
	{
		variants: {
			variant: {
				filled: "bg-sidebar-accent text-sidebar-accent-foreground",
				outline:
					"bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
			},
		},
		defaultVariants: {
			variant: "filled",
		},
	},
);

const sidebarMenuButtonVariants = cva(
	"peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! group-data-[collapsible=icon]:justify-center [&:not([data-highlight])]:hover:bg-sidebar-accent [&:not([data-highlight])]:hover:text-sidebar-accent-foreground [&:not([data-highlight])]:data-[state=open]:hover:bg-sidebar-accent [&:not([data-highlight])]:data-[state=open]:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
	{
		variants: {
			variant: {
				filled:
					"[&:not([data-highlight])]:hover:bg-sidebar-accent [&:not([data-highlight])]:hover:text-sidebar-accent-foreground",
				outline:
					"bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] [&:not([data-highlight])]:hover:bg-sidebar-accent [&:not([data-highlight])]:hover:text-sidebar-accent-foreground [&:not([data-highlight])]:hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
			},
			size: {
				sm: "h-7 text-xs",
				md: "h-8 text-sm",
				lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
			},
		},
		defaultVariants: {
			variant: "filled",
			size: "md",
		},
	},
);

type SidebarMenuButtonProps = React.ComponentProps<"button"> & {
	asChild?: boolean;
	isActive?: boolean;
	tooltip?: string | React.ComponentProps<typeof TooltipContent>;
} & VariantProps<typeof sidebarMenuButtonVariants>;

const SidebarMenuButton = React.forwardRef<
	HTMLButtonElement,
	SidebarMenuButtonProps
>(
	(
		{
			asChild = false,
			isActive = false,
			variant = "filled",
			size = "md",
			tooltip,
			className,
			...props
		},
		ref,
	) => {
		const Comp = asChild ? SlotPrimitive.Slot : "button";
		const { isMobile, state } = useSidebar();

		const button = (
			<MotionHighlightItem
				activeClassName={sidebarMenuButtonActiveVariants({ variant })}
			>
				<Comp
					className={cn(
						sidebarMenuButtonVariants({ variant, size }),
						className,
					)}
					data-active={isActive}
					data-sidebar="menu-button"
					data-size={size}
					data-slot="sidebar-menu-button"
					ref={ref}
					{...props}
				/>
			</MotionHighlightItem>
		);

		if (!tooltip) {
			return button;
		}

		if (typeof tooltip === "string") {
			tooltip = {
				children: tooltip,
			};
		}

		return (
			<Tooltip>
				<TooltipTrigger asChild>{button}</TooltipTrigger>
				<TooltipContent
					align="center"
					hidden={(state !== "collapsed" && !props.disabled) || isMobile}
					side="right"
					{...tooltip}
				/>
			</Tooltip>
		);
	},
);

SidebarMenuButton.displayName = "SidebarMenuButton";

type SidebarMenuActionProps = React.ComponentProps<"button"> & {
	asChild?: boolean;
	showOnHover?: boolean;
};

const SidebarMenuAction = React.forwardRef<
	HTMLButtonElement,
	SidebarMenuActionProps
>(({ className, asChild = false, showOnHover = false, ...props }, ref) => {
	const Comp = asChild ? SlotPrimitive.Slot : "button";

	return (
		<Comp
			className={cn(
				// Increases the hit area of the button on mobile.
				"absolute top-1.5 right-1 z-[1] flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-hidden ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 peer-hover/menu-button:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
				"after:absolute after:-inset-2 md:after:hidden",
				"peer-data-[size=sm]/menu-button:top-1",
				"peer-data-[size=default]/menu-button:top-1.5",
				"peer-data-[size=lg]/menu-button:top-2.5",
				"group-data-[collapsible=icon]:hidden",
				showOnHover &&
					"group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground md:opacity-0",
				className,
			)}
			data-sidebar="menu-action"
			data-slot="sidebar-menu-action"
			ref={ref}
			{...props}
		/>
	);
});

SidebarMenuAction.displayName = "SidebarMenuAction";

const sidebarMenuBadgeVariants = cva(
	"pointer-events-none absolute top-1/2 right-1 flex -translate-y-1/2 select-none items-center justify-center rounded-md font-medium tabular-nums peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden",
	{
		variants: {
			variant: {
				default: "h-5 min-w-5 px-1 text-xs text-sidebar-foreground",
				secondary:
					"h-4 px-1.5 text-[10px] text-white bg-slate-600 dark:bg-slate-500",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

type SidebarMenuBadgeProps = React.ComponentProps<"div"> &
	VariantProps<typeof sidebarMenuBadgeVariants>;

function SidebarMenuBadge({
	className,
	variant,
	...props
}: SidebarMenuBadgeProps) {
	return (
		<div
			className={cn(sidebarMenuBadgeVariants({ variant }), className)}
			data-sidebar="menu-badge"
			data-slot="sidebar-menu-badge"
			{...props}
		/>
	);
}

type SidebarMenuSkeletonProps = React.ComponentProps<"div"> & {
	showIcon?: boolean;
};

function SidebarMenuSkeleton({
	className,
	showIcon = false,
	...props
}: SidebarMenuSkeletonProps) {
	return (
		<div
			className={cn(
				"flex h-10 items-center gap-2 rounded-md px-2",
				"group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2",
				className,
			)}
			data-sidebar="menu-skeleton"
			data-slot="sidebar-menu-skeleton"
			{...props}
		>
			<Skeleton
				className={cn(
					"size-4 shrink-0 rounded-md bg-slate-600",
					showIcon ? "block" : "hidden group-data-[collapsible=icon]:block",
				)}
				data-sidebar="menu-skeleton-icon"
			/>
			<Skeleton
				className="h-10 w-full flex-1 bg-slate-600 group-data-[collapsible=icon]:hidden"
				data-sidebar="menu-skeleton-text"
			/>
		</div>
	);
}

type SidebarMenuSubProps = React.ComponentProps<"ul">;

function SidebarMenuSub({ className, ...props }: SidebarMenuSubProps) {
	return (
		<ul
			className={cn(
				"mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
				"group-data-[collapsible=icon]:hidden",
				className,
			)}
			data-sidebar="menu-sub"
			data-slot="sidebar-menu-sub"
			{...props}
		/>
	);
}

type SidebarMenuSubItemProps = React.ComponentProps<"li">;

function SidebarMenuSubItem({ className, ...props }: SidebarMenuSubItemProps) {
	return (
		<li
			className={cn("group/menu-sub-item relative", className)}
			data-sidebar="menu-sub-item"
			data-slot="sidebar-menu-sub-item"
			{...props}
		/>
	);
}

type SidebarMenuSubButtonProps = React.ComponentProps<"a"> & {
	asChild?: boolean;
	size?: "sm" | "md";
	isActive?: boolean;
	disabled?: boolean;
	tooltip?: string | React.ComponentProps<typeof TooltipContent>;
};

const SidebarMenuSubButton = React.forwardRef<
	HTMLAnchorElement,
	SidebarMenuSubButtonProps
>(
	(
		{
			asChild = false,
			size = "md",
			isActive = false,
			className,
			tooltip,
			...props
		},
		ref,
	) => {
		const Comp = asChild ? SlotPrimitive.Slot : "a";

		const button = (
			<MotionHighlightItem activeClassName="bg-sidebar-accent text-sidebar-accent-foreground rounded-md">
				<Comp
					aria-disabled={props["aria-disabled"]}
					className={cn(
						"flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-0.5 text-sidebar-foreground outline-hidden ring-sidebar-ring focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&:not([data-highlight])]:hover:bg-sidebar-accent [&:not([data-highlight])]:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
						"data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
						size === "sm" && "text-xs",
						size === "md" && "text-sm",
						"group-data-[collapsible=icon]:hidden",
						className,
					)}
					data-active={isActive}
					data-sidebar="menu-sub-button"
					data-size={size}
					data-slot="sidebar-menu-sub-button"
					ref={ref}
					{...props}
				/>
			</MotionHighlightItem>
		);

		if (!tooltip) {
			return button;
		}

		if (typeof tooltip === "string") {
			tooltip = {
				children: tooltip,
			};
		}

		return (
			<Tooltip>
				<TooltipTrigger asChild>{button}</TooltipTrigger>
				<TooltipContent
					align="center"
					hidden={!props.disabled}
					side="right"
					{...tooltip}
				/>
			</Tooltip>
		);
	},
);

SidebarMenuSubButton.displayName = "SidebarMenuSubButton";

export {
	Sidebar,
	SidebarContent,
	SidebarContext,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupAction,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInput,
	SidebarInset,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
	SidebarRail,
	SidebarSeparator,
	SidebarTrigger,
	useSidebar,
	type SidebarProps,
	type SidebarContentProps,
	type SidebarFooterProps,
	type SidebarGroupProps,
	type SidebarGroupActionProps,
	type SidebarGroupContentProps,
	type SidebarGroupLabelProps,
	type SidebarHeaderProps,
	type SidebarInputProps,
	type SidebarInsetProps,
	type SidebarMenuProps,
	type SidebarMenuActionProps,
	type SidebarMenuBadgeProps,
	type SidebarMenuButtonProps,
	type SidebarMenuItemProps,
	type SidebarMenuSkeletonProps,
	type SidebarMenuSubProps,
	type SidebarMenuSubItemProps,
	type SidebarMenuSubButtonProps,
	type SidebarProviderProps,
	type SidebarRailProps,
	type SidebarSeparatorProps,
	type SidebarTriggerProps,
};
