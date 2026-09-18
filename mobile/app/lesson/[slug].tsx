// Full-screen lesson player. Reached from the Learn tab (Continue hero + LessonSheet
// Start button). Registered inside the signed-in protected block in app/_layout.tsx.
import { useLocalSearchParams } from 'expo-router';
import { LessonPlayerScreen } from '@/features/learn/LessonPlayerScreen';

export default function LessonRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <LessonPlayerScreen slug={slug ?? ''} />;
}
