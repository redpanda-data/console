import { InfoIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from 'components/redpanda-ui/components/sheet';
import { useState } from 'react';

import globExampleImg from '../../../../../assets/globExample.png';
import { Code } from '../../../../../utils/tsx-utils';

const globHelp = (
  <div>
    {/* Examples + Image */}
    <div className="flex gap-2">
      <div className="flex grow">
        <div className="globHelpGrid">
          <div className="h">Pattern</div>
          <div className="h">Result</div>
          <div className="h">Reason / Explanation</div>

          <div className="titleRowSeparator" />

          {/* Example */}
          <div className="c1">
            <Code>id</Code>
          </div>
          <div className="c2">id: 1111</div>
          <div className="c3">There is only one 'id' property at the root of the object</div>
          <div className="rowSeparator" />

          {/* Example */}
          <div className="c1">
            <Code>*.id</Code>
          </div>
          <div className="c2">
            <div>customer.id: 2222</div>
            <div>key.with.dots.id: 3333</div>
          </div>
          <div className="c3">Star only seraches in direct children. Here, only 2 children contain an 'id' prop</div>
          <div className="rowSeparator" />

          {/* Example */}
          <div className="c1">
            <Code>**.id</Code>
          </div>
          <div className="c2">(all ID properties)</div>
          <div className="c3">Double-star searches everywhere</div>
          <div className="rowSeparator" />

          {/* Example */}
          <div className="c1">
            <Code>customer.*Na*</Code>
          </div>
          <div className="c2">
            <div>customer.firstName: John</div>
            <div>customer.lastName: Example</div>
          </div>
          <div className="c3">In the direct child named 'customer', find all properties that contain 'Na'</div>
          <div className="rowSeparator" />

          {/* Example */}
          <div className="c1">
            <Code>key.with.dots.id</Code>
          </div>
          <div className="c2">(no results!)</div>
          <div className="c3">There is no property named 'key'!</div>
          <div className="rowSeparator" />

          {/* Example */}
          <div className="c1">
            <Code>"key.with.dots".id</Code>
          </div>
          <div className="c2">key.with.dots.id: 3333</div>
          <div className="c3">
            To find properties with special characters in their name, use single or double-quotes
          </div>
          <div className="rowSeparator" />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ opacity: 0.5, fontSize: 'smaller', textAlign: 'center' }}>Example Data</div>
        <img alt="Examples for glob patterns" src={globExampleImg} />
      </div>
    </div>

    {/* Details */}
    <div>
      <h3>Details</h3>
      <div>
        A glob pattern is just a list of property names seperated by dots. In addition to simple property names you can
        use:
      </div>
      <ul style={{ paddingLeft: '2em', marginTop: '.5em' }}>
        <li>
          <Code>*</Code> Star to match all current properties
        </li>
        <li>
          <Code>**</Code> Double-Star to matches all current and nested properties
        </li>
        <li>
          <Code>"</Code>/<Code>'</Code> Quotes for when a property-name contains dots
        </li>
        <li>
          <Code>abc*</Code> One or more stars within a name. Depending on where you place the star, you can check if a
          name starts with, ends with, or contains some string.
        </li>
      </ul>
    </div>
  </div>
);

export const PatternHelpDrawer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const onOpen = () => setIsOpen(true);
  const onClose = () => setIsOpen(false);

  return (
    <>
      <button
        onClick={onOpen}
        style={{
          margin: '0 2px',
          color: 'var(--color-action-primary)',
          textDecoration: 'underline dotted',
        }}
        type="button"
      >
        <InfoIcon size={15} />
        &nbsp;glob patterns
      </button>
      <Sheet onOpenChange={setIsOpen} open={isOpen}>
        {/* SheetContent is not a flex column, so the header and footer only stay pinned once it is.
            `container` opts out of the dialog's PortalContainerProvider — DialogContent is
            transformed and `overflow-hidden`, so it would clip this fixed panel.
            `size="full"` drops the variant's 36rem cap; Chakra's drawer `xl` was 56rem. */}
        <SheetContent
          className="flex flex-col overflow-hidden sm:max-w-4xl"
          container={document.body}
          side="right"
          size="full"
        >
          <SheetHeader>
            <SheetTitle>Glob Pattern Examples</SheetTitle>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">{globHelp}</div>

          {/* SheetFooter is a flex column, which would stretch a lone button across the panel. */}
          <SheetFooter className="flex-row justify-end">
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
};
