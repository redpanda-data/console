interface GetParams {
  kind: string
}

export default function Get({kind}: GetParams) {
  switch (kind) {
    case 'input':
      return '#78dce8';
    case 'buffer':
      return '#fc9867';
    case 'output':
      return '#ff6188';
    case 'processor':
      return '#a9dc76';
    default:
      return '#ab9df2';
  }
}
