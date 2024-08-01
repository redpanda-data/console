
import styles from './ErrorDisplay.module.css';

interface AppParams {
  title?: string
  err: Error | null
  hideImg?: boolean;
  url?: string
  children?: any
}

export default function App({title, err, hideImg, url, children}: AppParams) {
  return <div className={styles.errorWrapper}>
    <div className={styles.errorDisplay}>
      { hideImg ? null : <img className={styles.errorImg} src="/img/whoops.svg" alt="whoopsie"/> }
      { title ? <h2 className={styles.errorHeader}>{title}</h2> : null }
      {url ? <p className={styles.errorDescription}>An error occurred whilst attempting to load <code>{url}</code>:</p> : null }
      <pre className={styles.errorMessage}>{err?.toString() || ''}</pre>
      {children ? children : <p className={styles.errorDescription}>Try refreshing the page, if the problem persists then let us know at <a href="mailto:support@benthos.dev">support@benthos.dev</a>.</p> }
    </div>
  </div>
}
