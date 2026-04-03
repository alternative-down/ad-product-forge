import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';

import '../styles/v1.css';
import { AppShell } from '../v1/components/layout/app-shell';

export const Route = createFileRoute('/v1')({
  component: V1Route,
});

function V1Route() {
  useEffect(() => {
    document.body.dataset.adminUi = 'v1';

    return () => {
      delete document.body.dataset.adminUi;
      delete document.body.dataset.theme;
    };
  }, []);

  return <AppShell />;
}
