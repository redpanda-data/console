import { useContext } from 'react';
import { Link } from 'react-router-dom';
import classNames from 'classnames';

import EnvContext from './env/EnvContext';
// import Alerts from './alerts/Alerts';
// import Settings from './settings/Settings';
// import BreadCrumbs, { Summary } from './breadcrumbs/BreadCrumbs';
// import UserInfo from './user/UserInfo';
// import icon from './icon';

import styles from './StatusBar.module.css';

interface StatusBarParams {
  showMainLinks?: boolean;
  // crumbs?: Summary,
  children?: any,
}

export default function StatusBar({ showMainLinks = false, children }: StatusBarParams) {
  // const themeContext = useContext(ThemeContext);
  const envContext = useContext(EnvContext);

  const isSelfHosted = !envContext.system.isLoading && envContext.system.info?.shost;

  return <div className={styles.StatusBar}>
    <div className={styles.leftBlock}>
      <Link to="/" className={styles.rootLink}>
        <img alt="benthos studio" src="/img/logo.svg" height="20px" style={{ marginRight: '7px' }} />
        <span className={styles.leftTitle}>Benthos Studio{isSelfHosted ? ' Self-Hosted' : null}</span>
      </Link>
    </div>
    <div className={styles.middleBlock}>
      {showMainLinks ? <>
        <Link title="dashboard" className={classNames('bstdioTopBarTextBtn')} to="/app/view/user">Dashboard</Link>
        {!envContext.system.isLoading && !envContext.system.info?.shost ?
          <Link title="pricing" className={classNames('bstdioTopBarTextBtn')} to="/app/pricing">Pricing</Link> : null}
        <a className={classNames('bstdioTopBarTextBtn')} href="https://www.benthos.dev">Docs</a>
      </> : null}
      {/* { crumbs ? <div className={classNames(styles.crumbs)}>
        <BreadCrumbs summary={crumbs} />
      </div> : null } */}
      {(children || []).length > 0 ? <div className={classNames(styles.children)}>
        {children}
      </div> : null}
    </div>
    <div className={classNames(styles.rightBlock)}>
      {/* <Alerts /> */}
      {/* <Settings /> */}
      {/* <button className="bstdioEmojiBtn" title="Change theme" onClick={themeContext.toggleTheme}>
        {themeContext.theme === 'light' ? icon.light : icon.dark}
      </button> */}
      {/* <UserInfo /> */}
    </div>
  </div>
}
