import { Box } from '@chakra-ui/react';
import { CopyButton } from '@redpanda-data/ui';
import { Prism as SyntaxHighlighter, type SyntaxHighlighterProps } from 'react-syntax-highlighter';
import prism from 'react-syntax-highlighter/dist/cjs/styles/prism/prism';

import { nightOwlDarkThemeBackground, nightOwlTheme } from './night-owl-theme';

export interface ChatCodeBlockProps extends Omit<SyntaxHighlighterProps, 'children'> {
  language: string;
  codeString: string;
  highlightLines?: [number, number];
  removeLineBreaksFromCopy?: boolean;
  showLineNumbers?: boolean;
  showCopyButton?: boolean;
  /**
   * @deprecated this setting is no longer relevant, the scroll will appear if required
   */
  showScroll?: boolean;
  theme?: 'dark' | 'light';
}

const lightThemeBackground = '#F5F2F0';

export const ChatCodeBlock = ({
  language,
  codeString,
  highlightLines,
  removeLineBreaksFromCopy = false,
  showLineNumbers = false,
  showCopyButton = true,
  theme = 'dark',
  ...otherProps
}: ChatCodeBlockProps) => {
  const shouldHighlightLine = (index: number) => {
    if (!highlightLines) {
      return false;
    }
    const lineNumber = index + 1;
    const inRange = lineNumber >= highlightLines[0] && lineNumber <= highlightLines[1];
    return inRange;
  };

  const backgroundColor = theme === 'dark' ? nightOwlDarkThemeBackground : lightThemeBackground;

  return (
    <Box position="relative" zIndex="0">
      <Box
        __css={{
          '&::-webkit-scrollbar': {
            overflow: 'visible',
            width: '4px',
            borderRadius: 'full',
          },
          '&::-webkit-scrollbar-thumb': {
            background: backgroundColor,
            borderRadius: 'full',
          },
          '&::-webkit-scrollbar-track': {
            background: backgroundColor,
            borderRadius: 'full',
          },
          '&::-webkit-scrollbar-corner': {
            background: backgroundColor,
          },
        }}
        bg={backgroundColor}
        color="white"
        overflow="hidden"
        px={0}
        rounded="md"
      >
        <Box>
          <SyntaxHighlighter
            {...otherProps}
            codeTagProps={{
              className: 'break-all',
            }}
            customStyle={{
              margin: 0,
              padding: '10px',
              lineHeight: '1.3rem',
            }}
            language={language}
            lineNumberStyle={{
              opacity: '0.4',
              userSelect: 'none',
              paddingRight: '20px',
            }}
            lineProps={(lineNumber: number) => {
              const highlight = shouldHighlightLine(lineNumber - 1);
              const DIMMED_OPACITY = 0.5;
              return {
                style: {
                  backgroundColor: highlight ? 'whiteAlpha.200' : 'initial',
                  opacity: highlightLines ? (highlight ? 1 : DIMMED_OPACITY) : 1,
                },
              };
            }}
            PreTag="div"
            showLineNumbers={showLineNumbers}
            style={theme === 'dark' ? nightOwlTheme : prism}
            wrapLines
          >
            {removeLineBreaksFromCopy ? codeString.replace(/[\n\r]/g, '') : codeString}
          </SyntaxHighlighter>
        </Box>
      </Box>
      {showCopyButton && (
        <Box position="absolute" right={1} top={1}>
          <CopyButton
            _hover={{
              background: backgroundColor,
              color: 'brand.400',
            }}
            background={backgroundColor}
            borderRadius="base"
            color={theme === 'dark' ? 'whiteAlpha.900' : 'black.900'}
            content={removeLineBreaksFromCopy ? codeString.replace(/[\n\r]/g, '') : codeString}
            padding="0.4rem"
          />
        </Box>
      )}
    </Box>
  );
};
