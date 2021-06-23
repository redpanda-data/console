import { observable, autorun, IReactionDisposer, computed, transaction, action, makeObservable } from "mobx";

/*
    Intended use:
    create a FilterableDataSource and give it a function (a mobx @computed) that acts as the data source,
    as well as a filter function (that accepts or rejects elements of the data source based on the filterText).
    When either the filterText or the dataSource change, the filter will be applied to all elements of the source,
    and the result will be set to 'data' (which is observable as well of course)
*/
export class FilterableDataSource<T> {
    private reactionDisposer?: IReactionDisposer;

    @observable filterText: string = ''; // set by the user (from an input field or so, can be read/write)

    @observable private _lastFilterText: string = '';
    @computed get lastFilterText() { return this._lastFilterText; }
    @observable.ref private resultData: T[] = []; // set by this class (so only exposed through computed prop)
    @computed get data(): T[] { return this.resultData; }

    constructor(
        private dataSource: () => T[] | undefined,
        private filter: (filterText: string, item: T) => boolean,
        debounceMilliseconds?: number
    ) {
        if (!debounceMilliseconds) debounceMilliseconds = 100;
        this.reactionDisposer = autorun(this.update.bind(this), { delay: debounceMilliseconds, name: 'FilterableDataSource' });

        makeObservable(this);
    }

    private update() {
        transaction(() => {
            const source = this.dataSource();
            const filterText = this.filterText;
            if (source) {
                this.resultData = source.filter(x => this.filter(filterText, x));
                //console.log('updating filterableDataSource: ...');
            } else {
                this.resultData = [];
                //console.log('updating filterableDataSource: source == undefined|null');
            }
            this._lastFilterText = this.filterText;
        });
    }

    dispose() {
        if (this.reactionDisposer) {
            this.reactionDisposer();
            this.reactionDisposer = undefined;
        }
    }
}