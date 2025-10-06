import { Text } from 'components/redpanda-ui/components/typography';
import Prism from 'prismjs';
import { useEffect, useState } from 'react';
import Editor from 'react-simple-code-editor';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism.css';

interface JSONEditorProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export const JSONEditor = ({ value, onChange, error: externalError }: JSONEditorProps) => {
  const [editorContent, setEditorContent] = useState(value || '');
  const [internalError, setInternalError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setEditorContent(value || '');
  }, [value]);

  const handleEditorChange = (newContent: string) => {
    setEditorContent(newContent);
    setInternalError(undefined);
    onChange(newContent);
  };

  const displayError = internalError || externalError;

  return (
    <div className="relative">
      <div className={`border rounded-md ${displayError ? 'border-red-500' : 'border-gray-200 dark:border-gray-800'}`}>
        <Editor
          className="w-full"
          highlight={(code) => Prism.highlight(code, Prism.languages.json, 'json')}
          onValueChange={handleEditorChange}
          padding={10}
          style={{
            fontFamily: '"Fira code", "Fira Mono", monospace',
            fontSize: 14,
            backgroundColor: 'transparent',
            minHeight: '100px',
          }}
          value={editorContent}
        />
      </div>
      {displayError && (
        <Text className="text-red-500 mt-1" variant="small">
          {displayError}
        </Text>
      )}
    </div>
  );
};
