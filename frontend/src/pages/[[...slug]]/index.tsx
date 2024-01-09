'use client';

import React, { useEffect, useState, StrictMode } from 'react';
import dynamic from 'next/dynamic';

/**
 * @see https://nextjs.org/docs/pages/building-your-application/optimizing/lazy-loading#with-no-ssr
 */
const App = dynamic(() => import('../../App'), {
  ssr: false,
  loading: () => (
      <div
        style={{
          height: '100vh',
          width: '100vw',
          flexDirection: 'column',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src="/redpanda/redpanda-color.svg"
          width={200}
          height={40}
          alt="Redpanda Cloud Logo"
        />
        <div style={{ marginTop: '24px' }}>Loading...</div>
      </div>
  ),
});

export default function Page() {
  const [render, setRender] = useState(false);
  useEffect(() => setRender(true), []);

  return (
    <StrictMode>
          {typeof window === 'undefined' || !render ? null : <App />}
    </StrictMode>
  );
}
