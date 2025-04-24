/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { type IReactionDisposer, autorun, computed, makeObservable, observable, transaction, makeAutoObservable, runInAction } from "mobx";

/*
    Intended use:
    create a FilterableDataSource and give it a function (a mobx @computed) that acts as the data source,
    as well as a filter function (that accepts or rejects elements of the data source based on the filterText).
    When either the filterText or the dataSource change, the filter will be applied to all elements of the source,
    and the result will be set to 'data' (which is observable as well of course)
*/
export class FilterableDataSource<T> {
  @observable filterText = "";
  @observable private _lastFilterText = "";
  @observable.ref private resultData: T[] = [];

  private reactionDisposer?: IReactionDisposer;

  constructor(private readonly dataSource: () => T[] | undefined, private readonly filter: (filterText: string, item: T) => boolean, debounceMilliseconds: number = 100) {
    makeObservable(this);
    this.reactionDisposer = autorun(
      () => {
        this.update();
      },
      {
        delay: debounceMilliseconds,
        name: "FilterableDataSource",
      }
    );
  }

  @computed
  get lastFilterText(): string {
    return this._lastFilterText;
  }

  @computed
  get data(): T[] {
    return this.resultData;
  }

  private update(): void {
    runInAction(() => {
      const sourceData = this.dataSource();
      if (!sourceData) {
        this.resultData = [];
        return;
      }

      if (!this.filterText) {
        this.resultData = sourceData;
        return;
      }

      this._lastFilterText = this.filterText;
      this.resultData = sourceData.filter((x: T) => this.filter(this.filterText, x));
    });
  }

  dispose(): void {
    if (this.reactionDisposer) {
      this.reactionDisposer();
    }
  }
}
