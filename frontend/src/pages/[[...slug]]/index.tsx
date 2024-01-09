import React, { useEffect, useState, StrictMode } from 'react';
import dynamic from 'next/dynamic';
import { GetStaticProps, GetStaticPaths } from 'next';
import { useRouter } from 'next/router';

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {},
  }
}

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: ['/', '/overview', '/overview/:brokerId', '/topics', '/topics/:topicName', '/topics/:topicName/produce-record', '/schema-registry', '/schema-registry/create', '/schema-registry/subjects/:subjectName/add-version', '/schema-registry/subjects/:subjectName', '/schema-registry/edit-compatibility', '/schema-registry/subjects/:subjectName/edit-compatibility', '/groups', '/groups/:groupId/', '/acls', '/quotas', '/connect-clusters', '/connect-clusters/:clusterName', '/connect-clusters/:clusterName/create-connector', '/connect-clusters/:clusterName/:connector', '/reassign-partitions', '/admin'],
    fallback: false,
  }
}

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

  const router = useRouter();

  useEffect(() => {
    if (router.asPath.endsWith('/')) {
      router.push('/overview');
    }
  }, [router])

  return (
    <StrictMode>
          {typeof window === 'undefined' || !render ? null : <App />}
    </StrictMode>
  );
}
