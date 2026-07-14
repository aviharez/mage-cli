import { createConfiguredWebAPIs } from './runtimeConfig';
import type { RuntimeAPIs } from '@mage/ui/lib/api/types';
import '@mage/ui/index.css';
import '@mage/ui/styles/fonts';

declare global {
  interface Window {
    __MAGE_RUNTIME_APIS__?: RuntimeAPIs;
  }
}

window.__MAGE_RUNTIME_APIS__ = createConfiguredWebAPIs();

void import('@mage/ui/apps/renderMobileApp')
  .then(({ renderMobileApp }) => {
    renderMobileApp(window.__MAGE_RUNTIME_APIS__ ?? createConfiguredWebAPIs());
  });
