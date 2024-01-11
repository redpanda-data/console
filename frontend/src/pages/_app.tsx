import { ChakraProvider, redpandaTheme } from '@redpanda-data/ui'
import type { AppProps } from 'next/app'
 
// Global CSS

// Antd
import 'antd/dist/antd.variable.min.css';

import '../globals.scss';
// import '../index.module.scss';
// import '../index-cloud-integration.module.scss';
import '../index.scss';
import '../index-cloud-integration.scss';

// Fonts
import '../assets/fonts/open-sans.css';
import '../assets/fonts/poppins.css';
import '../assets/fonts/quicksand.css';
import '../assets/fonts/kumbh-sans.css';
import '../assets/fonts/inter.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ChakraProvider theme={redpandaTheme}>
      <Component {...pageProps} />
    </ChakraProvider>
  )
}
