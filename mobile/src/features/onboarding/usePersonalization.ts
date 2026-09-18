import { useCurrentUser } from '@/hooks/useCurrentUser';
import { goalPlan, levelOption } from './options';

/**
 * The signed-in user's onboarding answers, resolved into what each tab should show.
 * Falls back to beginner / "learn the basics" when unknown (e.g. backend offline).
 */
export function usePersonalization() {
  const { data: user } = useCurrentUser();
  return {
    level: levelOption(user?.level),
    plan: goalPlan(user?.goal),
    isPersonalized: !!user?.goal,
  };
}
