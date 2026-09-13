import { useCallback, useRef, useState } from 'react';

// One hover/focus tooltip per chart. Attach `ref` to the chart's positioned container and spread
// `bind(content)` onto each mark; keyboard focus shows the same content as the pointer.
export function useTooltip() {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);

  const place = useCallback((clientX, clientY, content) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: clientX - box.left, y: clientY - box.top, content });
  }, []);

  const bind = (content) => ({
    onPointerMove: (event) => place(event.clientX, event.clientY, content),
    onPointerLeave: () => setTip(null),
    onFocus: (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      place(rect.left + rect.width / 2, rect.top, content);
    },
    onBlur: () => setTip(null),
  });

  return { ref, tip, bind };
}
