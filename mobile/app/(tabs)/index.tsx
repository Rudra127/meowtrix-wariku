// Learn tab — Duolingo-style finance lessons. Spec: docs/ROADMAP.md → "Learn".
// Build the real screen under src/features/learn/ and render it here.
import { ComingSoon } from '@/components/ComingSoon';

export default function LearnScreen() {
  return (
    <ComingSoon
      icon="school-outline"
      title="Learn"
      tagline="Bite-sized money lessons, one streak at a time."
      planned={[
        'Units → lessons → short quizzes',
        'XP, daily streaks and hearts',
        'Personalised path based on your goals',
      ]}
    />
  );
}
