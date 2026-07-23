export default function ScoreBadge({ score }: { score: number }) {
  const bg = score >= 75 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626'
  return (
    <span
      style={{
        background: bg,
        color: '#fff',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {score}
    </span>
  )
}
