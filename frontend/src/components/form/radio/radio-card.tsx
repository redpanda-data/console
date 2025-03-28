import { Box, type RadioProps, useColorModeValue, useRadio } from '@redpanda-data/ui';

export type Sizes = 'sm' | 'md' | 'lg';

export type RadioCardProps = {
  size?: Sizes;
} & RadioProps;

export const RadioCard = ({ size = 'md', ...radioProps }: RadioCardProps) => {
  const { getInputProps, getRadioProps } = useRadio(radioProps);

  const input = getInputProps();
  const radio = getRadioProps();

  const focusChecked = radio['data-checked'] === '' && radio['data-focus'] === '';

  const invalidStyle = {
    textColor: 'red.500',
    borderColor: 'red.500',
  };

  const checkedStyle = {
    position: 'relative',
    outline: '1px solid',
    ...useColorModeValue(
      {
        bg: 'transparent',
        borderColor: 'darkblue.800 !important',
        outlineColor: 'darkblue.800',
        boxShadow: '4px 4px 0px 0px var(--chakra-colors-blackAlpha-300)',
      },
      {
        bg: 'transparent',
        borderColor: 'white !important',
        outlineColor: 'white',
        boxShadow: '4px 4px 0px 0px var(--chakra-colors-whiteAlpha-300)',
      },
    ),
  };

  const hoverStyle = useColorModeValue(
    {
      borderColor: 'blackAlpha.500',
    },
    {
      borderColor: 'whiteAlpha.500',
    },
  );

  const sizes = {
    sm: { px: 4, py: 1, fontSize: 'sm' },
    md: { px: 5, py: 2 },
    lg: { px: 6, py: 3, fontSize: 'lg' },
  }[size as Sizes];

  return (
    <Box as="label" data-testid={`${radioProps.value}_field`}>
      <input {...input} />
      <Box
        {...radio}
        cursor="pointer"
        borderWidth="1px"
        borderRadius="md"
        transition="100ms all ease-in-out"
        _invalid={invalidStyle}
        _checked={checkedStyle}
        _hover={hoverStyle}
        _focus={
          focusChecked
            ? {
                boxShadow: 'outline',
              }
            : undefined
        }
        _disabled={{
          cursor: 'not-allowed',
          opacity: 0.5,
        }}
        px={sizes.px}
        py={sizes.py}
        fontSize={sizes.fontSize}
      >
        {radioProps.children}
      </Box>
    </Box>
  );
};
