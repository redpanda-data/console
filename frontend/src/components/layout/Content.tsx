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

import { Toaster } from 'components/redpanda-ui/components/sonner';
import { TooltipProvider } from 'components/redpanda-ui/components/tooltip';
import { observer } from 'mobx-react';

import { ModalContainer } from '../../utils/ModalContainer';
import AppFooter from '../layout/Footer';
import AppPageHeader from '../layout/Header';
import { LicenseNotification } from '../license/LicenseNotification';
import { ErrorDisplay } from '../misc/ErrorDisplay';
import { renderErrorModals } from '../misc/ErrorModal';
import { NullFallbackBoundary } from '../misc/NullFallbackBoundary';
import { RouteView } from '../routes';

export const AppContent = observer(() => (
  <div id="mainLayout">
    <TooltipProvider>
      {/* Page */}
      <NullFallbackBoundary>
        <LicenseNotification />
      </NullFallbackBoundary>
      <ModalContainer />
      <AppPageHeader />

      <ErrorDisplay>
        <RouteView />
      </ErrorDisplay>

      <AppFooter />

      {/* Currently disabled, read todo comment on UpdatePopup */}
      {/* <UpdatePopup /> */}
      {renderErrorModals()}

      {/* Toaster for notifications */}
      <Toaster />
    </TooltipProvider>
  </div>
));

export default AppContent;
