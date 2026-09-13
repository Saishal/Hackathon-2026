// One drawn icon set for the whole dashboard: 24px grid, 1.6 stroke, round joins.
// Icons are decorative by default; pass `label` when an icon carries meaning on its own.
const PATHS = {
  overview: <><rect x="3.5" y="3.5" width="7" height="8" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="14.5" width="7" height="6" rx="1.5" /></>,
  people: <><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" /><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M18.2 14.8c1.7.7 2.9 2.4 3.3 5.2" /></>,
  network: <><circle cx="5.5" cy="6" r="2" /><circle cx="5.5" cy="18" r="2" /><circle cx="18.5" cy="12" r="2.5" /><path d="M7.4 6.7 16.1 11M7.4 17.3l8.7-4.3" /></>,
  timemachine: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3.5 4v4h4" /><path d="M12 7.5V12l3 2" /></>,
  ai: <><path d="M12 3.5c.5 3.9 2.1 5.5 6 6-3.9.5-5.5 2.1-6 6-.5-3.9-2.1-5.5-6-6 3.9-.5 5.5-2.1 6-6Z" /><path d="M18.5 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5Z" /></>,
  data: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" /></>,
  activity: <><path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12" /><circle cx="4.5" cy="6.5" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="17.5" r="1" /></>,
  shield: <><path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.9 7 9 4.1-1.1 7-4.8 7-9V6l-7-2.5Z" /><path d="m9 12 2 2 4-4" /></>,
  inbox: <><path d="M3.5 13.5 6 5.5h12l2.5 8v5h-17v-5Z" /><path d="M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5" /></>,
  audit: <><path d="M7 3.5h7l4 4v13H7Z" /><path d="M14 3.5v4h4" /><path d="M9.5 12h6M9.5 15.5h6M9.5 8.5h2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.7-3.6 3.5-5.5 7-5.5s6.3 1.9 7 5.5" /></>,
  logout: <><path d="M9.5 20.5h-4a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1h4" /><path d="m15.5 16.5 4.5-4.5-4.5-4.5M20 12H9.5" /></>,
  download: <><path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5" /><path d="M4.5 19.5h15" /></>,
  refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8.5 10.5v-3a3.5 3.5 0 0 1 7 0v3" /></>,
  edit: <path d="m15 5 4 4L9 19H5v-4L15 5Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  flag: <path d="M5.5 21V4M5.5 4.5h11l-2 4 2 4h-11" />,
  question: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4M12 16.8v.1" /></>,
  forecast: <><path d="M3.5 17.5 9 12l3.5 3 8-8" strokeDasharray="2.5 2.5" /><path d="M16 7h4.5v4.5" /></>,
  unmet: <><circle cx="12" cy="12" r="8.5" /><path d="m9 9 6 6m0-6-6 6" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>,
  alert: <><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4.2M12 17.2v.1" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.1" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  close: <path d="m6.5 6.5 11 11m0-11-11 11" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  sun: <><circle cx="12" cy="12" r="3.8" /><path d="M12 2.8V5M12 19v2.2M2.8 12H5M19 12h2.2M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M5.5 18.5l1.6-1.6M16.9 7.1l1.6-1.6" /></>,
  moon: <path d="M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10Z" />,
  monitor: <><rect x="3.5" y="4.5" width="17" height="11.5" rx="1.5" /><path d="M9 20h6M12 16v4" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.3 2.3 3.5 5.2 3.5 8.5s-1.2 6.2-3.5 8.5c-2.3-2.3-3.5-5.2-3.5-8.5s1.2-6.2 3.5-8.5Z" /></>,
  pie: <><path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12Z" /><path d="M15 3.9A8.5 8.5 0 0 1 20.1 9H15Z" /></>,
  bars: <><path d="M4.5 20.5h15" /><rect x="5.5" y="11" width="3" height="7" rx="1" /><rect x="10.5" y="6" width="3" height="12" rx="1" /><rect x="15.5" y="13.5" width="3" height="4.5" rx="1" /></>,
  hbars: <><path d="M3.5 4v16" /><rect x="6" y="5" width="12" height="3" rx="1" /><rect x="6" y="10.5" width="7" height="3" rx="1" /><rect x="6" y="16" width="14" height="3" rx="1" /></>,
  stacked: <><rect x="3.5" y="5" width="17" height="4" rx="1" /><rect x="3.5" y="15" width="17" height="4" rx="1" /><path d="M10 5v4M15 5v4M8 15v4M13 15v4" /></>,
  matrix: <><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.8" /></>,
  checkAll: <path d="m2.5 12.5 4 4 8-8.5M11 16l.5.5 8-8.5" />,
  launch: <><path d="M13.5 4.5h6v6" /><path d="M19.5 4.5 11 13" /><path d="M17.5 14v5a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V8A1.5 1.5 0 0 1 5 6.5h5" /></>,
};

export default function Icon({ name, size = 18, label, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {PATHS[name]}
    </svg>
  );
}

// The Keystone mark: the wedge at the top of an arch that holds the rest in place.
export function KeystoneMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="keystone-mark">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path className="keystone-mark-arch" d="M7.5 25v-5a8.5 8.5 0 0 1 17 0v5" fill="none" strokeOpacity=".42" strokeWidth="3" strokeLinecap="round" />
      <path className="keystone-mark-stone" d="M13.3 7.8h5.4l-1 5.9h-3.4l-1-5.9Z" />
    </svg>
  );
}
