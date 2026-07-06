interface StatCardProps {
  label: string;
  value: string;
  sublabel?: string;
}

export default function StatCard({ label, value, sublabel }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sublabel && <div className="stat-sublabel">{sublabel}</div>}
    </div>
  );
}
