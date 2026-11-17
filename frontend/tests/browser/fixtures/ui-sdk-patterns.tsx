import { checkPattern } from '@ui-sdk/core/testing';
import { createAgent } from '@ui-sdk/react/agent';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { Checkbox } from '../../../src/components/redpanda-ui/components/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../src/components/redpanda-ui/components/dropdown-menu';
import { EditorSurface } from '../../../src/components/redpanda-ui/components/editor-surface';
import { Field, FieldDescription, FieldError, FieldLabel } from '../../../src/components/redpanda-ui/components/field';
import { Input } from '../../../src/components/redpanda-ui/components/input';
import { Switch } from '../../../src/components/redpanda-ui/components/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../src/components/redpanda-ui/components/tabs';
import { ConsoleWebMcp } from '../../../src/components/redpanda-ui/components/webmcp';

Reflect.set(globalThis, '__UI_SDK_STRICT__', true);

type ConsolePattern = 'tabs' | 'checkbox' | 'switch' | 'menu';
const menuWork = Promise.withResolvers<void>();
let menuFinished = false;
function MenuWidget() {
  const [status, setStatus] = useState('idle');
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => {
              setStatus('pending');
              return menuWork.promise.then(() => setStatus('done'));
            }}
          >
            Delete draft
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <output aria-label="Menu action" data-testid="menu-action-status">
        {status}
      </output>
    </>
  );
}
function PatternWidget({ pattern }: { pattern: ConsolePattern }) {
  if (pattern === 'menu') {
    return <MenuWidget />;
  }
  if (pattern === 'tabs') {
    return (
      <Tabs defaultValue="source">
        <TabsList aria-label="Draft sections">
          <TabsTrigger value="source">Source</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
          <TabsTrigger value="finish">Finish</TabsTrigger>
        </TabsList>
        <TabsContent keepMounted value="source">
          Source form
        </TabsContent>
        <TabsContent keepMounted value="review">
          Review form
        </TabsContent>
        <TabsContent keepMounted value="finish">
          Finish form
        </TabsContent>
      </Tabs>
    );
  }
  return pattern === 'checkbox' ? <Checkbox aria-label="Enable retention" /> : <Switch aria-label="Enable retention" />;
}
function mountFixture(pattern: ConsolePattern, direction: 'ltr' | 'rtl') {
  const container = Object.assign(document.createElement('main'), { dir: direction });
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      <ConsoleWebMcp enabled={false}>
        <PatternWidget pattern={pattern} />
      </ConsoleWebMcp>
    )
  );
  return { container, root };
}
async function checkConsolePattern(pattern: ConsolePattern, direction: 'ltr' | 'rtl') {
  const { container, root } = mountFixture(pattern, direction);
  try {
    const widget = pattern === 'tabs' ? container : container.querySelector(`[role="${pattern}"]`);
    if (!widget) {
      throw new Error(`Missing ${pattern} widget`);
    }
    if (pattern !== 'menu') {
      await checkPattern(widget, pattern);
    }
    return { pattern, direction, passed: true };
  } finally {
    flushSync(() => root.unmount());
    container.remove();
  }
}
declare global {
  // biome-ignore lint/style/useConsistentTypeDefinitions: extends the browser test fixture's Window contract
  interface Window {
    checkConsolePattern: typeof checkConsolePattern;
    completeConsoleMenu: () => void;
    isConsoleMenuFinished: () => boolean;
    mountConsoleFields: () => void;
    mountConsoleMenu: () => void;
    pressConsoleMenu: () => ReturnType<ReturnType<typeof createAgent>['act']>;
  }
}
window.checkConsolePattern = checkConsolePattern;

window.mountConsoleMenu = () => {
  mountFixture('menu', 'ltr');
};
window.pressConsoleMenu = () =>
  createAgent()
    .act({ steps: [{ ref: 'Delete draft', action: 'activate' }] })
    .then((result) => {
      menuFinished = true;
      return result;
    });
window.completeConsoleMenu = () => menuWork.resolve();
window.isConsoleMenuFinished = () => menuFinished;

window.mountConsoleFields = () => {
  const container = document.createElement('main');
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      <>
        <Field data-disabled={false} data-invalid={false} testId="valid-field">
          <FieldLabel>Valid setting</FieldLabel>
          <Input />
        </Field>
        <Field data-disabled="false" data-invalid="false" testId="valid-string-field">
          <FieldLabel>Another valid setting</FieldLabel>
          <Input />
        </Field>
        <Field data-invalid>
          <FieldLabel>Cluster name</FieldLabel>
          <Input />
          <FieldDescription>Shown in the header.</FieldDescription>
          <FieldError>Name is required.</FieldError>
        </Field>
        <Field data-invalid disabled>
          <FieldLabel>Draft source</FieldLabel>
          <EditorSurface onValueChange={() => undefined} value="" />
          <FieldDescription>Use valid YAML.</FieldDescription>
          <FieldError>Source is required.</FieldError>
        </Field>
      </>
    )
  );
};
