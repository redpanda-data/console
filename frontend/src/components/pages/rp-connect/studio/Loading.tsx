interface LoadingParams {
  action?: string
}

export default function Loading({action}: LoadingParams) {
  return <div className="loading">
    <img alt="loading" src="/img/blobbounce.gif"/>
    <div>{action ? action : 'Loading...'}</div>
  </div>
}
