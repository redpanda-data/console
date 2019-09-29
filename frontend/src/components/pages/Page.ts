import React from "react";
import { ParsedQuery } from "query-string";
import { PageDefinition } from "../routes";
import { uiSettings, uiState } from "../../state/ui";


//
// Page Types
//
export type PageProps<TRouteParams = {}> = TRouteParams & { matchedPath: string; query: ParsedQuery; }

export class PageInitHelper {
	set title(title: string) { uiState.pageTitle = title; }
	addBreadcrumb(title: string, to: string) { uiState.pageBreadcrumbs.push({ title: title, linkTo: to }) }
	set extraContent(value: () => React.ReactNode) { uiState.pageHeaderExtra = value; }
}
export abstract class PageComponent<TRouteParams = {}> extends React.Component<PageProps<TRouteParams>> {

	constructor(props: Readonly<PageProps<TRouteParams>>) {
		super(props);

		uiState.pageBreadcrumbs = [];
		uiState.pageHeaderExtra = () => null;

		this.initPage(new PageInitHelper());
	}

	abstract initPage(p: PageInitHelper): void;
}
export type PageComponentType<TRouteParams = {}> = (new (props: PageProps<TRouteParams>) => PageComponent<PageProps<TRouteParams>>);


