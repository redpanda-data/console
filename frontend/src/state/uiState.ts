import { observable, computed } from "mobx";
import { PageDefinition } from "../components/routes";
import { clone } from "../utils/utils";
import { api } from "./backendApi";
import { AclRequest, AclRequestDefault } from "./restInterfaces";
import { uiSettings, TopicDetailsSettings as TopicSettings } from "./ui";


export interface BreadcrumbEntry {
    title: string;
    linkTo: string;
}

class UIState {
    @observable private _pageTitle: string = ' '
    @computed get pageTitle() { return this._pageTitle; }
    set pageTitle(title: string) { this._pageTitle = title; document.title = title + ' - Kowl'; }

    @observable pageBreadcrumbs: BreadcrumbEntry[] = []

    @computed get selectedClusterName(): string | null {
        if (uiSettings.selectedClusterIndex in api.clusters)
            return api.clusters[uiSettings.selectedClusterIndex];
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
            if (!uiSettings.perTopicSettings.any(s => s.topicName == topicName)) {
                console.log('creating details for topic: ' + topicName);
                const topicSettings = new TopicSettings();
                topicSettings.topicName = topicName;
                uiSettings.perTopicSettings.push(topicSettings);
            }
        }
    }

    get topicSettings(): TopicSettings {
        const n = this.currentTopicName;
        if (!n) {
            return new TopicSettings();
        }

        const topicSettings = uiSettings.perTopicSettings.find(t => t.topicName == n);
        if (topicSettings) return topicSettings;

        throw new Error('reaction for "currentTopicName" was supposed to create topicDetail settings container');
    }

    @observable loginError: string | null = null;
    @observable isUsingDebugUserLogin: boolean = false;

    // Every API response contains the 'app-version' header (which is set here after the request).
    // If the version doesn't match the current frontend version a promt is shown (like 'new version available, want to reload to update?').
    // If the user declines, updatePromtHiddenUntil is set to prevent the promt from showing up for some time.
    @observable serverVersion: string | undefined = undefined;
    @observable updatePromtHiddenUntil: number | undefined = undefined;
}


const uiState = new UIState();
export { uiState };
