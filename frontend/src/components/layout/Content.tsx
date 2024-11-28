/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { observer } from 'mobx-react';
import AppFooter from '../layout/Footer';
import AppPageHeader from '../layout/Header';
import { ErrorDisplay } from '../misc/ErrorDisplay';
import { renderErrorModals } from '../misc/ErrorModal';
import { RouteView } from '../routes';
import { ModalContainer } from '../../utils/ModalContainer';
import { LicenseNotification } from '../license/LicenseNotification';

export const AppContent = observer(() => (
  <div id="mainLayout">
    {/* Page */}
    <LicenseNotification />
    <ModalContainer />
    <AppPageHeader />

    <ErrorDisplay>
      <RouteView />
    </ErrorDisplay>

    <AppFooter />

    {/* Currently disabled, read todo comment on UpdatePopup */}
    {/* <UpdatePopup /> */}
    {renderErrorModals()}
  </div>
));

export default AppContent;
