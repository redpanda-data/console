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

import { Input } from 'components/redpanda-ui/components/input';
import React, { Component } from 'react';

export class SearchTitle extends Component<{
  title: string;
  observableFilterOpen: { filterOpen: boolean };
  observableSettings: { quickSearch: string };
}> {
  inputRef = React.createRef<HTMLInputElement>(); // reference to input, used to focus it

  state = {
    filterOpen: false,
    quickSearch: '',
  };

  constructor(p: {
    title: string;
    observableFilterOpen: { filterOpen: boolean };
    observableSettings: { quickSearch: string };
  }) {
    super(p);
    this.hideSearchBar = this.hideSearchBar.bind(this);
    this.focusInput = this.focusInput.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  render() {
    const props = this.props;

    if (!this.state.filterOpen) {
      return this.props.title;
    }

    // Render the actual search bar

    // inputRef won't be set yet, so we delay by one frame
    setTimeout(this.focusInput);

    return (
      <span>
        {!this.state.filterOpen && <span>{this.props.title}</span>}
        {/* NOTE: this overlay is currently unreachable — `filterOpen` is initialised false and
            nothing sets it true (see `hideSearchBar`, which only clears it). Kept as-is by the
            migration; wiring or removing it is a separate change. The absolute positioning also
            assumed Chakra's `Th` was `position: relative`, which the Registry TableHead is not. */}
        <div className="absolute inset-y-0 right-0 left-[-8px] flex place-content-center place-items-center">
          <Input
            // The clicks must not reach the sortable column header; the input is the interactive
            // element, so the handlers live here rather than on the wrapper.
            onBlur={(e) => {
              const inputWrapper = e.target.parentElement;
              const focusInside = inputWrapper?.contains(e.relatedTarget as HTMLElement);

              if (focusInside) {
                // Most likely a click on the "clear" button
                props.observableSettings.quickSearch = '';
                this.setState({ quickSearch: '' });
                this.hideSearchBar();
              } else {
                setTimeout(this.hideSearchBar);
              }
            }}
            onChange={(e) => {
              props.observableSettings.quickSearch = e.target.value;
              this.setState({ quickSearch: e.target.value });
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={this.onKeyDown}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            placeholder="Enter search term/regex"
            ref={this.inputRef}
            spellCheck={false}
            value={this.state.quickSearch}
          />
        </div>
      </span>
    );
  }

  focusInput() {
    this.inputRef.current?.focus();
  }

  hideSearchBar() {
    this.props.observableFilterOpen.filterOpen = false;
    this.setState({ filterOpen: false });
  }

  onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === 'Escape') {
      this.hideSearchBar();
    }
  }
}
