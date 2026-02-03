"use client";

import { Editor, rootCtx, defaultValueCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { Badge } from "components/redpanda-ui/components/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/redpanda-ui/components/tabs";
import { Textarea } from "components/redpanda-ui/components/textarea";
import { cn } from "components/redpanda-ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import "./markdown-editor.css";

export type MarkdownEditorMode = "editor" | "raw";

export type MarkdownEditorProps = {
  /** The markdown content */
  value?: string;
  /** Called when the markdown content changes */
  onChange?: (value: string) => void;
  /** Controlled mode - if provided, tabs are hidden and mode is controlled externally */
  mode?: MarkdownEditorMode;
  /** Additional class name for the container */
  className?: string;
};

function MilkdownEditorInner({ value, onChange }: { value: string; onChange?: (value: string) => void }) {
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialValueRef.current);

        const listenerPlugin = ctx.get(listenerCtx);
        listenerPlugin.markdownUpdated((_ctx, markdown, prevMarkdown) => {
          if (markdown !== prevMarkdown) {
            onChangeRef.current?.(markdown);
          }
        });
      })
      .use(commonmark)
      .use(history)
      .use(listener);
  }, []);

  return <Milkdown />;
}

/**
 * Tabs component for the markdown editor - can be placed externally (e.g., in a card header)
 */
export function MarkdownEditorTabs({
  mode,
  onModeChange,
  className,
}: {
  mode: MarkdownEditorMode;
  onModeChange: (mode: MarkdownEditorMode) => void;
  className?: string;
}) {
  return (
    <Tabs value={mode} onValueChange={(v) => onModeChange(v as MarkdownEditorMode)} className={className}>
      <TabsList>
        <TabsTrigger value="editor" className="gap-1.5">
          Editor
          <Badge variant="outline" className="px-1 py-0 text-[10px] font-normal">
            Markdown
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="raw">Raw</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/**
 * Markdown editor component with WYSIWYG editing and raw mode.
 * Can be used standalone (with internal tabs) or controlled externally.
 */
export function MarkdownEditor({
  value = "",
  onChange,
  mode: controlledMode,
  className,
}: MarkdownEditorProps) {
  const [internalMode, setInternalMode] = useState<MarkdownEditorMode>("editor");
  const [localValue, setLocalValue] = useState(value);
  const [editorKey, setEditorKey] = useState(0);

  const isControlled = controlledMode !== undefined;
  const activeMode = isControlled ? controlledMode : internalMode;

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // When switching from raw to editor, remount to pick up changes
  useEffect(() => {
    if (activeMode === "editor") {
      setEditorKey((k) => k + 1);
    }
  }, [activeMode]);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    onChange?.(newValue);
  };

  const handleModeChange = (newMode: MarkdownEditorMode) => {
    setInternalMode(newMode);
  };

  const editorContent = (
    <div className="rounded-md border border-input bg-background">
      <MilkdownProvider key={editorKey}>
        <MilkdownEditorInner onChange={handleChange} value={localValue} />
      </MilkdownProvider>
    </div>
  );

  const rawContent = (
    <Textarea
      value={localValue}
      onChange={(e) => handleChange(e.target.value)}
      className="min-h-[150px] font-mono text-sm"
      placeholder="Enter markdown..."
    />
  );

  // Controlled mode - no internal tabs
  if (isControlled) {
    return (
      <div className={cn("markdown-editor-wrapper", className)}>
        {activeMode === "editor" ? editorContent : rawContent}
      </div>
    );
  }

  // Uncontrolled mode - render with internal tabs
  return (
    <div className={cn("markdown-editor-wrapper", className)}>
      <Tabs value={activeMode} onValueChange={(v) => handleModeChange(v as MarkdownEditorMode)}>
        <TabsList className="mb-2">
          <TabsTrigger value="editor" className="gap-1.5">
            Editor
            <Badge variant="outline" className="px-1 py-0 text-[10px] font-normal">
              Markdown
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="raw">Raw</TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="mt-0">
          {editorContent}
        </TabsContent>

        <TabsContent value="raw" className="mt-0">
          {rawContent}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export type MarkdownPreviewProps = {
  source: string;
  className?: string;
  /** When true, applies disabled/readonly styling (gray background) */
  disabled?: boolean;
};

/**
 * Read-only markdown preview component using Milkdown.
 */
export function MarkdownPreview({ source, className, disabled }: MarkdownPreviewProps) {
  return (
    <div className={cn(
      "markdown-editor-wrapper rounded-md border",
      disabled ? "border-gray-200 bg-gray-50" : "border-input bg-background",
      className
    )}>
      <MilkdownProvider>
        <MilkdownReadOnly value={source} />
      </MilkdownProvider>
    </div>
  );
}

function MilkdownReadOnly({ value }: { value: string }) {
  useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, value);
      })
      .use(commonmark);
  }, [value]);

  return <Milkdown />;
}
