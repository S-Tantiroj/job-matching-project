export function scoreClass(score: number): 'ok' | 'warn' | 'bad' {
  return score >= 75 ? 'ok' : score >= 50 ? 'warn' : 'bad'
}

export default function ScoreBadge({ score }: { score: number }) {
  return <span className={`badge-score badge-score--${scoreClass(score)}`}>{score}</span>
}
