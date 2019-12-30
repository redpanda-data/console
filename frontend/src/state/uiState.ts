import { observable, computed } from "mobx";
import { PageDefinition } from "../components/routes";
import { api } from "./backendApi";
import { uiSettings } from "./ui";


export interface BreadcrumbEntry {
    title: string;
    linkTo: string;
}

export class TopicDetailsSettings {

    // per topic
    @observable activeTabKey: string | undefined = undefined;
    @observable favConfigEntries: Array<string> = ['cleanup.policy', 'segment.bytes', 'segment.ms'];

    private pushIfNotPresent(...items: string[]): void {
        items.forEach(item => {
            if (!this.favConfigEntries.find(i => i === item)) {
                this.favConfigEntries.push(item);
            }
        });
    }

    public setAvailableFavs(cleanupPolicy: string): void {
        switch (cleanupPolicy) {
            case "delete":
                this.pushIfNotPresent(
                    'retention.ms',
                    'retention.bytes',
                );
                break;
            case "compact":
                this.pushIfNotPresent(
                    'min.cleanable.dirty.ratio',
                    'delete.retention.ms',
                );
                break;
            case "compact,delete":
                this.pushIfNotPresent(
                    'retention.ms',
                    'retention.bytes',
                    'min.cleanable.dirty.ratio',
                    'delete.retention.ms',
                );
                break;
        }
        console.log("setAvailableFavs: " + this.favConfigEntries);
    }
}

class UIState {
    @observable private _pageTitle: string = ' '
    @computed get pageTitle() { return this._pageTitle; }
    set pageTitle(title: string) { this._pageTitle = title; document.title = title + ' - KafkaOwl'; }

    @observable pageBreadcrumbs: BreadcrumbEntry[] = []

    @observable private pageHeaderExtraFunc: (() => React.ReactNode) | undefined = undefined
    @computed get pageHeaderExtra(): () => React.ReactNode { return this.pageHeaderExtraFunc || (() => null) }
    set pageHeaderExtra(func: (() => React.ReactNode)) { this.pageHeaderExtraFunc = func; }

    @computed get selectedClusterName(): string | null {
        if (uiSettings.selectedClusterIndex in api.Clusters)
            return api.Clusters[uiSettings.selectedClusterIndex];
        return null;
    }

    @observable currentRoute = null as (PageDefinition<any> | null); // will be null when a page fails to render

    @observable pathName: string; // automatically updated from router path
    @computed get selectedMenuKeys(): string[] | undefined {
        // For now path root is perfect
        let path = this.pathName;

        const i = path.indexOf('/', 1);
        if (i > -1) path = path.substr(0, i);

        return [path];
    }


    @observable
    private _currentTopicName: string | undefined;
    public get currentTopicName(): string | undefined { return this._currentTopicName; }
    public set currentTopicName(topicName: string | undefined) {
        this._currentTopicName = topicName;
        if (topicName) {
            if (!uiSettings.allTopicsDetails.has(topicName)) {
                console.log('creating details for topic: ' + topicName);
                uiSettings.allTopicsDetails.set(topicName, new TopicDetailsSettings());
            }
        }
    }

    get topicDetails(): TopicDetailsSettings {
        const n = this.currentTopicName;
        if (!n) {
            return new TopicDetailsSettings();
        }

        if (uiSettings.allTopicsDetails.has(n)) {
            return uiSettings.allTopicsDetails.get(n)!;
        }

        throw new Error('reaction was supposed to create topicDetail settings container');
    }
}


const uiState = new UIState();
export { uiState };
