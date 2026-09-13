import Icon from './Icon';

// The five ways Keystone labels how far to trust a value. Used wherever those labels appear.
const ITEMS = [
  ['dash', 'Unknown', 'No record exists. Shown as a dash and never counted as zero.', 'tag-outline'],
  ['info', 'Unverified', 'Recorded, but nobody has confirmed it with a verification date.', 'tag-outline'],
  ['alert', 'Unmet requirement', 'Recorded below the level a role or skill needs.', 'tag-danger'],
  ['shield', 'Data-quality warning', 'A rule found something to fix before relying on the number.', 'tag-warn'],
  ['timemachine', 'Modelled forecast', 'A scenario or a pending change. Never official data.', 'tag-accent'],
];

export default function TrustLegend() {
  return (
    <details className="trust-legend">
      <summary>How to read trust labels</summary>
      <dl>
        {ITEMS.map(([icon, label, text, tone]) => (
          <div key={label}>
            <dt><span className={`tag ${tone}`}><Icon name={icon} size={13} /> {label}</span></dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
