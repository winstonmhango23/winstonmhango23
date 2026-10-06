import { useRouter, type Href } from 'expo-router';

import { ClientActionTile } from '@/components/staff-ui';
import { AI_STUDIO_HREF, AI_STUDIO_TILE_HINT } from '@/lib/staff/ai-studio-access';

export function AiStudioActionTile({
  variant = 'accent',
}: {
  variant?: 'default' | 'accent';
}) {
  const router = useRouter();
  return (
    <ClientActionTile
      icon="auto-awesome"
      label="AI Studio"
      hint={AI_STUDIO_TILE_HINT}
      variant={variant}
      onPress={() => router.push(AI_STUDIO_HREF as Href)}
    />
  );
}
