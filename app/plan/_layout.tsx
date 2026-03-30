import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Stack } from 'expo-router';

export default function PlanLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.tint,
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: 'Chivo_700Bold', fontSize: 18 },
        contentStyle: { backgroundColor: theme.background },
      }}
    />
  );
}
