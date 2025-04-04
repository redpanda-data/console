import { css } from '@emotion/css';

export const buttonCss = css({
  display: 'inline-flex',
  appearance: 'none',
  WebkitBoxAlign: 'center',
  alignItems: 'center',
  WebkitBoxPack: 'center',
  justifyContent: 'center',
  userSelect: 'none',
  position: 'relative',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
  outline: 'transparent solid 2px',
  outlineOffset: '2px',
  lineHeight: '1.71429rem',
  borderRadius: '0.375rem',
  fontWeight: '600',
  transitionProperty: 'background-color, border-color, color, fill, stroke, opacity, box-shadow, transform',
  transitionDuration: '200ms',
  color: '#FFFFFF',
  borderColor: '#2D3A53',
  height: '2.42857rem',
  minWidth: '2.5rem',
  fontSize: '1rem',
  paddingInlineStart: '1rem',
  paddingInlineEnd: '1rem',
  background: '#E53E3E',
  padding: '0px 1.15rem !important',
  '&:hover': {
    backgroundColor: '#BC321A',
  },
});

export const errorCss = css({
  borderColor: '#E53E3E',
  boxShadow: '0 0 0 1px #E53E3E',
});

export const errorMessageCss = css({
  display: 'flex',
  WebkitAlignItems: 'center',
  WebkitBoxAlign: 'center',
  MsFlexAlign: 'center',
  alignItems: 'center',
  color: '#E53E3E',
  marginTop: '0.5rem',
  fontSize: '0.85rem',
  lineHeight: 'normal',
});
