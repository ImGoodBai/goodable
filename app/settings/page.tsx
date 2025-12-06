"use client";

import { useState } from 'react';
import AppSidebar from '@/components/layout/AppSidebar';
import GlobalSettings from '@/components/settings/GlobalSettings';

export default function SettingsPage() {
  const [isClosing, setIsClosing] = useState(false);

  return (
    <div className="h-screen bg-white flex overflow-hidden">
      {/* App Sidebar */}
      <AppSidebar
        currentPage="settings"
        onNavigate={(page) => {
          if (page === 'settings') {
            // Already on settings page
            return;
          }
          // Navigate back to main app
          if (window.opener) {
            window.opener.focus();
            window.close();
          } else {
            window.location.href = '/';
          }
        }}
      />

      {/* Settings Content */}
      <div className="flex-1 overflow-hidden">
        <GlobalSettings
          isOpen={true}
          embedded={true}
          onClose={() => {
            setIsClosing(true);
            setTimeout(() => {
              if (window.opener) {
                window.close();
              } else {
                window.location.href = '/';
              }
            }, 200);
          }}
          initialTab="ai-agents"
        />
      </div>
    </div>
  );
}
