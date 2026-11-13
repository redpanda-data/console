import { checkPattern } from '@ui-sdk/core/testing';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { Checkbox } from '../../../src/components/redpanda-ui/components/checkbox';
import { Switch } from '../../../src/components/redpanda-ui/components/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../src/components/redpanda-ui/components/tabs';

Reflect.set(globalThis, '__UI_SDK_STRICT__', true);

type ConsolePattern = 'tabs' | 'checkbox' | 'switch';
function PatternWidget({ pattern }: { pattern: ConsolePattern }) {
  if (pattern === 'tabs') {
    return (
      <Tabs defaultValue="source">
        <TabsList aria-label="Draft sections">
          <TabsTrigger value="source">Source</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>
        <TabsContent keepMounted value="source">
          Source form
        </TabsContent>
        <TabsContent keepMounted value="review">
          Review form
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
  flushSync(() => root.render(<PatternWidget pattern={pattern} />));
  return { container, root };
}
async function checkConsolePattern(pattern: ConsolePattern, direction: 'ltr' | 'rtl') {
  const { container, root } = mountFixture(pattern, direction);
  try {
    const widget = pattern === 'tabs' ? container : container.querySelector(`[role="${pattern}"]`);
    if (!widget) {
      throw new Error(`Missing ${pattern} widget`);
    }
    await checkPattern(widget, pattern);
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
  }
}
window.checkConsolePattern = checkConsolePattern;
