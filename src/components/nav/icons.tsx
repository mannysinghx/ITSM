function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      {children}
    </svg>
  );
}

export const DashboardIcon = () => (
  <Svg>
    <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.2" />
    <rect x="11" y="2.5" width="6.5" height="4" rx="1.2" />
    <rect x="11" y="8.5" width="6.5" height="9" rx="1.2" />
    <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.2" />
  </Svg>
);

export const TicketIcon = () => (
  <Svg>
    <path d="M2.5 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1.2a1.7 1.7 0 0 0 0 2.6v1.2a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-1.2a1.7 1.7 0 0 0 0-2.6Z" />
    <path d="M8 5.5v9" strokeDasharray="1.6 1.6" />
  </Svg>
);

export const TaskIcon = () => (
  <Svg>
    <rect x="3" y="3" width="14" height="14" rx="2.5" />
    <path d="M6.5 10.2l2.1 2.1 4.9-4.9" />
  </Svg>
);

export const CatalogIcon = () => (
  <Svg>
    <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h9A2.5 2.5 0 0 1 17 6.5" />
    <rect x="3" y="6.5" width="14" height="9.5" rx="2" />
    <path d="M7 10h6" />
  </Svg>
);

export const ApprovalIcon = () => (
  <Svg>
    <circle cx="10" cy="10" r="7.2" />
    <path d="M7 10.2l2 2 4-4.2" />
  </Svg>
);

export const KnowledgeIcon = () => (
  <Svg>
    <path d="M10 5.2c-1.2-1-3-1.5-5-1.2v10.5c2 -.3 3.8.2 5 1.2 1.2-1 3-1.5 5-1.2V4c-2-.3-3.8.2-5 1.2Z" />
    <path d="M10 5.2v10.5" />
  </Svg>
);

export const SecurityIcon = () => (
  <Svg>
    <path d="M10 2.7l6 2.2v4.4c0 4-2.6 6.9-6 8-3.4-1.1-6-4-6-8V4.9Z" />
    <path d="M7.4 10l1.9 1.9 3.3-3.6" />
  </Svg>
);

export const AdminIcon = () => (
  <Svg>
    <circle cx="10" cy="10" r="2.4" />
    <path d="M10 3.2v1.8M10 15v1.8M16.8 10H15M5 10H3.2M14.9 5.1l-1.3 1.3M6.4 13.6l-1.3 1.3M14.9 14.9l-1.3-1.3M6.4 6.4L5.1 5.1" />
  </Svg>
);
