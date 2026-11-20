'use client';

// Copyright 2026 Redpanda Data, Inc.

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { jsonLanguage } from '@codemirror/lang-json';
import { syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, placeholder as editorPlaceholder, keymap, lineNumbers } from '@codemirror/view';
import { classHighlighter } from '@lezer/highlight';
import { useEffect, useRef } from 'react';

interface JSONCodeEditorProps {
  ariaLabel: string;
  describedBy?: string | undefined;
  id: string;
  invalid?: boolean | undefined;
  onValueChange: (value: string) => void;
  placeholder?: string | undefined;
  value: string;
}

type ContentAttributes = Pick<JSONCodeEditorProps, 'ariaLabel' | 'describedBy' | 'id' | 'invalid'>;

function contentAttributes({ ariaLabel, describedBy, id, invalid }: ContentAttributes) {
  return {
    ...(describedBy !== undefined && describedBy !== '' ? { 'aria-describedby': describedBy } : {}),
    'aria-invalid': invalid === true ? 'true' : 'false',
    'aria-label': ariaLabel,
    'aria-multiline': 'true',
    autocapitalize: 'off',
    autocomplete: 'off',
    autocorrect: 'off',
    id,
    spellcheck: 'false',
  };
}

const editorTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', fontSize: '0.875rem', minHeight: '6.25rem' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': {
    caretColor: 'var(--color-foreground)',
    fontFamily: 'var(--font-mono)',
    minHeight: '6.25rem',
    padding: '0.75rem 0',
  },
  // `surface-recess` is the declared translucent ground: an alpha of the rung above it composites
  // against whatever is behind and cannot be retuned centrally.
  '.cm-gutters': {
    backgroundColor: 'var(--color-surface-recess)',
    borderRightColor: 'var(--color-border)',
    color: 'var(--color-subtle)',
  },
  '.cm-line': { padding: '0 0.75rem' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 0.625rem 0 0.75rem' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', overflow: 'auto' },
  '.tok-bool, .tok-null, .tok-number': { color: 'var(--color-syntax-literal)' },
  '.tok-comment': { color: 'var(--color-subtle)', fontStyle: 'italic' },
  '.tok-keyword': { color: 'var(--color-syntax-keyword)' },
  '.tok-operator': { color: 'var(--color-syntax-operator)' },
  '.tok-propertyName': { color: 'var(--color-syntax-literal)' },
  '.tok-string': { color: 'var(--color-syntax-string)' },
});

function JSONCodeEditor({
  ariaLabel,
  describedBy,
  id,
  invalid = false,
  onValueChange,
  value,
  placeholder,
}: JSONCodeEditorProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>(null);
  const placeholderConfigurationRef = useRef<Compartment>(null);
  const initialPlaceholderRef = useRef(placeholder);
  const attributesConfigurationRef = useRef<Compartment>(null);
  const onValueChangeRef = useRef(onValueChange);
  const initialAttributesRef = useRef<ContentAttributes>({ ariaLabel, describedBy, id, invalid });
  const initialValueRef = useRef(value);
  const externalUpdateRef = useRef(false);

  useEffect(
    function syncCallback() {
      onValueChangeRef.current = onValueChange;
    },
    [onValueChange]
  );

  useEffect(function createEditor() {
    const parent = parentRef.current;
    if (parent === null) {
      return;
    }

    const placeholderConfiguration = new Compartment();
    const attributesConfiguration = new Compartment();
    placeholderConfigurationRef.current = placeholderConfiguration;
    attributesConfigurationRef.current = attributesConfiguration;
    const placeholderExtension = editorPlaceholder(initialPlaceholderRef.current ?? '');
    const initialAttributes = contentAttributes(initialAttributesRef.current);
    const attributesExtension = EditorView.contentAttributes.of(initialAttributes);
    const editor = new EditorView({
      parent,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          lineNumbers(),
          placeholderConfiguration.of(placeholderExtension),
          jsonLanguage,
          syntaxHighlighting(classHighlighter),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          attributesConfiguration.of(attributesExtension),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !externalUpdateRef.current) {
              onValueChangeRef.current(update.state.doc.toString());
            }
          }),
          editorTheme,
        ],
      }),
    });
    viewRef.current = editor;

    return () => {
      editor.destroy();
      viewRef.current = null;
      placeholderConfigurationRef.current = null;
      attributesConfigurationRef.current = null;
    };
  }, []);

  useEffect(
    function syncValue() {
      const editor = viewRef.current;
      if (editor === null || editor.state.doc.toString() === value) {
        return;
      }

      externalUpdateRef.current = true;
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
      externalUpdateRef.current = false;
    },
    [value]
  );

  useEffect(
    function syncPlaceholder() {
      const configuration = placeholderConfigurationRef.current;
      if (configuration === null) {
        return;
      }
      viewRef.current?.dispatch({
        effects: configuration.reconfigure(editorPlaceholder(placeholder ?? '')),
      });
    },
    [placeholder]
  );

  useEffect(
    function syncAttributes() {
      const editor = viewRef.current;
      const configuration = attributesConfigurationRef.current;
      if (editor === null || configuration === null) {
        return;
      }

      const attributes = contentAttributes({ ariaLabel, describedBy, id, invalid });
      editor.dispatch({
        effects: configuration.reconfigure(EditorView.contentAttributes.of(attributes)),
      });
    },
    [ariaLabel, describedBy, id, invalid]
  );

  return <div ref={parentRef} />;
}

export { JSONCodeEditor, type JSONCodeEditorProps };
