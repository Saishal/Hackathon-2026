// Value first, label second: the reader already knows which mark they are on and wants the number.
export default function ChartTooltip({ tip }) {
  if (!tip) return null;
  const { value, label, note } = tip.content;
  return (
    <div className="chart-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
      <strong>{value}</strong>
      <span>{label}</span>
      {note && <small>{note}</small>}
    </div>
  );
}
