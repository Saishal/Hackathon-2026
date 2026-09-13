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
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>,
  alert: <><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4.2M12 17.2v.1" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.1" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  close: <path d="m6.5 6.5 11 11m0-11-11 11" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
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
      <path d="M7.5 25v-5a8.5 8.5 0 0 1 17 0v5" fill="none" stroke="#fff" strokeOpacity=".42" strokeWidth="3" strokeLinecap="round" />
      <path d="M13.3 7.8h5.4l-1 5.9h-3.4l-1-5.9Z" fill="#fff" />
    </svg>
  );
}
