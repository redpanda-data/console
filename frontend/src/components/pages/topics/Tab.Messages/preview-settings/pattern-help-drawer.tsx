import {
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  useDisclosure,
} from '@redpanda-data/ui';
import { InfoIcon } from 'components/icons';

import globExampleImg from '../../../../../assets/globExample.png';
import { Code } from '../../../../../utils/tsx-utils';

export const globHelp = (
  <div>
    {/* Examples + Image */}
    <Flex gap={2}>
      <Flex grow={1}>
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
      </Flex>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ opacity: 0.5, fontSize: 'smaller', textAlign: 'center' }}>Example Data</div>
        <img alt="Examples for glob patterns" src={globExampleImg} />
      </div>
    </Flex>

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
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      <button
        onClick={onOpen}
        style={{
          margin: '0 2px',
          color: 'hsl(205deg, 100%, 50%)',
          textDecoration: 'underline dotted',
        }}
        type="button"
      >
        <InfoIcon size={15} />
        &nbsp;glob patterns
      </button>
      <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="xl">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>Glob Pattern Examples</DrawerHeader>

          <DrawerBody>{globHelp}</DrawerBody>

          <DrawerFooter>
            <Button mr={3} onClick={onClose} variant="outline">
              Close
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
};
