import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientActionGrid, ClientActionTile } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { staffApplicationWorkspaceHref } from '@/lib/staff/role-queues';

export function LoanBookTiles({
  variant = 'portfolio-book',
}: {
  variant?: 'portfolio-book' | 'legacy-queue';
}) {
  const router = useRouter();
  const legacyQuery = variant === 'legacy-queue' ? '&vintage=legacy' : '';
  return (
    <ClientActionGrid>
      <ClientActionTile
        icon="work"
        label="SME Loans"
        hint={
          variant === 'legacy-queue'
            ? 'Filter the dedicated legacy queue to SME products'
            : 'Business-book products'
        }
        onPress={() => router.push(`/(staff)/loans?book=SME${legacyQuery}` as Href)}
      />
      <ClientActionTile
        icon="eco"
        label="Group Loans"
        hint={
          variant === 'legacy-queue'
            ? 'Filter the dedicated legacy queue to Group products'
            : 'Village, cooperative, and group products'
        }
        onPress={() => router.push(`/(staff)/loans?book=GROUP${legacyQuery}` as Href)}
      />
      <ClientActionTile
        icon="account-balance"
        label={variant === 'legacy-queue' ? 'All legacy loans' : 'All loans'}
        hint={
          variant === 'legacy-queue'
            ? 'Dedicated legacy queue across both credit books'
            : 'Branch-wide loan book'
        }
        onPress={() =>
          router.push(
            (variant === 'legacy-queue' ? '/(staff)/loans?vintage=legacy' : '/(staff)/loans') as Href
          )
        }
      />
    </ClientActionGrid>
  );
}

export function WorkspaceQueuePreview({
  items,
  empty,
  hrefForItem,
}: {
  items: Array<{
    id: number;
    title: string;
    meta?: string;
  }>;
  empty: string;
  hrefForItem?: (id: number) => Href;
}) {
  const router = useRouter();
  if (items.length === 0) {
    return <ThemedText style={styles.empty}>{empty}</ThemedText>;
  }
  return (
    <View style={styles.queueList}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          style={styles.queueRow}
          onPress={() =>
            router.push(hrefForItem ? hrefForItem(item.id) : staffApplicationWorkspaceHref(item.id))
          }
        >
          <View style={{ flex: 1 }}>
            <ThemedText type="defaultSemiBold">{item.title}</ThemedText>
            {item.meta ? <ThemedText style={styles.meta}>{item.meta}</ThemedText> : null}
          </View>
          <MaterialIcons name="chevron-right" size={20} color={ClientUI.colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

export function WorkspaceSignOut({ embedded }: { embedded?: boolean }) {
  const router = useRouter();
  if (embedded) return null;
  return (
    <Pressable
      style={styles.switchBtn}
      onPress={async () => {
        const { signOutToLogin } = await import('@/lib/auth-sign-out');
        await signOutToLogin(router);
      }}
    >
      <MaterialIcons name="swap-horiz" size={20} color={ClientUI.colors.primary} />
      <ThemedText style={styles.switchText}>Sign in with a different account</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    marginBottom: 12,
  },
  queueList: { gap: 8, marginBottom: 8 },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  meta: {
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginTop: 2,
    fontFamily: Fonts.sans,
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 36,
    paddingVertical: 14,
  },
  switchText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: ClientUI.colors.primary,
  },
});
