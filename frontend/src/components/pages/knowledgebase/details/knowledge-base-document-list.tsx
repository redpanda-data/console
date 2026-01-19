/**
 * Copyright 2024 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useNavigate } from "@tanstack/react-router";
import {
	type ColumnDef,
	type ColumnFiltersState,
	flexRender,
	getCoreRowModel,
	getFacetedRowModel,
	getFacetedUniqueValues,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import { config } from "config";
import { Loader2, X } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";

import { Button } from "../../../redpanda-ui/components/button";
import {
	DataTableColumnHeader,
	DataTablePagination,
	DataTableViewOptions,
} from "../../../redpanda-ui/components/data-table";
import { Input } from "../../../redpanda-ui/components/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../../../redpanda-ui/components/table";
import { Heading, Text } from "../../../redpanda-ui/components/typography";

export type RetrievalResult = {
	score?: number;
	document_name: string;
	chunk_id: string;
	topic: string;
	text: string;
};

export type RetrievalResultRow = {
	id: string;
	score: number | undefined;
	topic: string;
	documentName: string;
	chunkId: string;
	content: string;
	original: RetrievalResult;
};

const transformRetrievalResult = (
	result: RetrievalResult,
	index: number,
): RetrievalResultRow => ({
	id: `${result.chunk_id}-${index}`,
	score: result.score,
	topic: result.topic,
	documentName: result.document_name,
	chunkId: result.chunk_id,
	content: result.text,
	original: result,
});

const createColumns = (): ColumnDef<RetrievalResultRow>[] => [
	{
		accessorKey: "score",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Score" />
		),
		cell: ({ row }) => {
			const score = row.getValue("score") as number | undefined;
			return (
				<Text className="font-mono">
					{score !== undefined ? score.toFixed(3) : "-"}
				</Text>
			);
		},
	},
	{
		accessorKey: "topic",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Topic" />
		),
		cell: ({ row }) => (
			<a
				className="text-blue-500 hover:text-blue-600 hover:underline"
				href={`/clusters/${config.clusterId}/topics/${encodeURIComponent(row.getValue("topic"))}`}
			>
				{row.getValue("topic")}
			</a>
		),
	},
	{
		accessorKey: "documentName",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Document" />
		),
		cell: ({ row }) => (
			<Text
				className="max-w-[200px] truncate font-mono"
				title={row.getValue("documentName")}
			>
				{row.getValue("documentName")}
			</Text>
		),
	},
	{
		accessorKey: "chunkId",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Chunk ID" />
		),
		cell: ({ row }) => (
			<Text className="font-mono" variant="muted">
				{row.getValue("chunkId")}
			</Text>
		),
	},
	{
		accessorKey: "content",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Content" />
		),
		cell: ({ row }) => {
			const content = row.getValue("content") as string;
			return <Text className="wrap-break-word line-clamp-2">{content}</Text>;
		},
	},
];

function RetrievalResultsToolbar({
	table,
}: {
	table: ReturnType<typeof useReactTable<RetrievalResultRow>>;
}) {
	const isFiltered = table.getState().columnFilters.length > 0;

	return (
		<div className="flex items-center justify-between gap-2">
			<div className="flex flex-1 items-center gap-1">
				<Input
					className="h-8 w-[200px]"
					onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
						table.setGlobalFilter(event.target.value)
					}
					placeholder="Filter content..."
					value={(table.getState().globalFilter as string) ?? ""}
				/>
				{Boolean(isFiltered) && (
					<Button
						onClick={() => table.resetColumnFilters()}
						size="sm"
						variant="ghost"
					>
						Reset
						<X className="ml-2 h-4 w-4" />
					</Button>
				)}
			</div>
			<DataTableViewOptions table={table} />
		</div>
	);
}

type KnowledgeBaseDocumentListProps = {
	results: RetrievalResult[];
	isLoading: boolean;
	knowledgebaseId: string;
};

export const KnowledgeBaseDocumentList: React.FC<
	KnowledgeBaseDocumentListProps
> = ({ results, isLoading, knowledgebaseId }) => {
	const navigate = useNavigate();

	// TanStack Table state
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
	const [globalFilter, setGlobalFilter] = useState("");

	// Transform results for table
	const transformedResults = useMemo(
		() =>
			results.map((result, index) => transformRetrievalResult(result, index)),
		[results],
	);

	// Create columns
	const columns = useMemo(() => createColumns(), []);

	// Handle row clicks - navigate to document details page
	const handleRowClick = (row: RetrievalResultRow, event: React.MouseEvent) => {
		const target = event.target as HTMLElement;
		// Don't trigger if clicking a link
		if (target.closest("a")) {
			return;
		}
		const result = row.original;
		navigate({
			to: "/knowledgebases/$knowledgebaseId/documents/$documentId",
			params: {
				knowledgebaseId,
				documentId: encodeURIComponent(result.document_name),
			},
			state: {
				chunkId: result.chunk_id,
				topic: result.topic,
				documentName: result.document_name,
				content: result.text,
				score: result.score,
			},
		});
	};

	// Set up TanStack Table
	const table = useReactTable({
		data: transformedResults,
		columns,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getFacetedRowModel: getFacetedRowModel(),
		getFacetedUniqueValues: getFacetedUniqueValues(),
		onColumnVisibilityChange: setColumnVisibility,
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: (row, _columnId, filterValue) => {
			const search = filterValue.toLowerCase();
			const topic = String(row.getValue("topic")).toLowerCase();
			const documentName = String(row.getValue("documentName")).toLowerCase();
			const chunkId = String(row.getValue("chunkId")).toLowerCase();
			const content = String(row.getValue("content")).toLowerCase();

			return (
				topic.includes(search) ||
				documentName.includes(search) ||
				chunkId.includes(search) ||
				content.includes(search)
			);
		},
		initialState: {
			pagination: {
				pageSize: 10,
			},
		},
		state: {
			sorting,
			columnFilters,
			columnVisibility,
			globalFilter,
		},
	});

	return (
		<div className="flex flex-col gap-4">
			<Heading level={3}>Results</Heading>
			<RetrievalResultsToolbar table={table} />
			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => (
								<TableHead key={header.id}>
									{header.isPlaceholder
										? null
										: flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)}
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{(() => {
						if (isLoading) {
							return (
								<TableRow>
									<TableCell
										className="h-24 text-center"
										colSpan={columns.length}
									>
										<div className="flex items-center justify-center gap-2">
											<Loader2 className="h-4 w-4 animate-spin" />
											<Text variant="muted">Loading results...</Text>
										</div>
									</TableCell>
								</TableRow>
							);
						}

						const rows = table.getRowModel().rows;

						if (rows.length === 0) {
							return (
								<TableRow>
									<TableCell
										className="h-24 text-center"
										colSpan={columns.length}
									>
										<Text align="center" variant="muted">
											No results found
										</Text>
									</TableCell>
								</TableRow>
							);
						}

						return rows.map((row) => (
							<TableRow
								className="cursor-pointer hover:bg-muted/50"
								data-state={row.getIsSelected() && "selected"}
								key={row.id}
								onClick={(e) => handleRowClick(row.original, e)}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						));
					})()}
				</TableBody>
			</Table>
			<DataTablePagination table={table} />
		</div>
	);
};
