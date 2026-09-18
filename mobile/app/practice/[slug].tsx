// AI practice round for one lesson. Reached from the Learn tab's lesson sheet and from the
// lesson results screen. Registered inside the signed-in protected block in app/_layout.tsx.
import { useLocalSearchParams } from 'expo-router';
import { PracticePlayerScreen } from '@/features/learn/PracticePlayerScreen';

export default function PracticeRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <PracticePlayerScreen slug={slug ?? ''} />;
}
