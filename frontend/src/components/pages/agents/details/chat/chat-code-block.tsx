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
        px={0}
        rounded="md"
        bg={backgroundColor}
        color="white"
        overflow="hidden"
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
      >
        <Box>
          <SyntaxHighlighter
            {...otherProps}
            PreTag="div"
            language={language}
            style={theme === 'dark' ? nightOwlTheme : prism}
            showLineNumbers={showLineNumbers}
            wrapLines
            customStyle={{
              margin: 0,
              padding: '10px',
              lineHeight: '1.3rem',
            }}
            codeTagProps={{
              className: 'break-all',
            }}
            lineNumberStyle={{
              opacity: '0.4',
              userSelect: 'none',
              paddingRight: '20px',
            }}
            lineProps={(lineNumber: number) => {
              const highlight = shouldHighlightLine(lineNumber - 1);
              return {
                style: {
                  backgroundColor: highlight ? 'whiteAlpha.200' : 'initial',
                  opacity: highlightLines ? (highlight ? 1 : 0.5) : 1,
                },
              };
            }}
          >
            {removeLineBreaksFromCopy ? codeString.replace(/[\n\r]/g, '') : codeString}
          </SyntaxHighlighter>
        </Box>
      </Box>
      {showCopyButton && (
        <Box position="absolute" top={1} right={1}>
          <CopyButton
            content={removeLineBreaksFromCopy ? codeString.replace(/[\n\r]/g, '') : codeString}
            background={backgroundColor}
            color={theme === 'dark' ? 'whiteAlpha.900' : 'black.900'}
            _hover={{
              background: backgroundColor,
              color: 'brand.400',
            }}
            borderRadius="base"
            padding="0.4rem"
          />
        </Box>
      )}
    </Box>
  );
};
