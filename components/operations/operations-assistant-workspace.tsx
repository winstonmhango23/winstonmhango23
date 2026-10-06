import { useCallback, useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';

import {
  ClientActionGrid,
  ClientActionTile,
  ClientHeroCard,
  ClientSectionTitle,
  StaffScreen,
} from '@/components/staff-ui';
import { AiStudioActionTile } from '@/components/staff/ai-studio-action-tile';
import { LoanBookTiles, WorkspaceSignOut } from '@/components/staff/role-workspace-preview';
import { ThemedText } from '@/components/themed-text';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import {
  apiGetOperationsAssistantPendingReviewGrouped,
  type ApiPendingReviewGroup,
} from '@/lib/data/api';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';
import { useNotificationsStore } from '@/store/notifications';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

export function OperationsAssistantWorkspace({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const ensureStaffBootstrap = useHomeBootstrapStore((s) => s.ensureStaffBootstrap);
  const [reviews, setReviews] = useState<ApiPendingReviewGroup[]>([]);

  const loadWorkspace = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      setReviews(await apiGetOperationsAssistantPendingReviewGrouped(auth.token, { limit: 8 }));
    } catch {
      /* keep last snapshot */
    }
  }, []);

  useEffect(() => {
    void ensureStaffBootstrap();
    void loadWorkspace();
  }, [ensureStaffBootstrap, loadWorkspace]);

  const firstName = user?.fullName?.split(' ')[0] ?? 'Assistant';
  const memberTotal = reviews.reduce((n, g) => n + (g.members?.length ?? 0), 0);
  const pending = reviews.length;
  const attention = memberTotal > 0 ? `${memberTotal} loan reviews` : 'All clear';

  return (
    <StaffScreen
      scroll
      onRefresh={loadWorkspace}
      header={{
        title: 'Operations Assistant',
        subtitle: 'Review accountant bookings before CEO fund release',
        showNotifications: true,
        unreadCount,
        stats: [
          { label: 'Pending reviews', value: String(pending) },
          { label: 'Ready for CEO', value: '—' },
          { label: 'Returned', value: '—' },
        ],
      }}
    >
      <ClientHeroCard
        greeting={`Welcome back, ${firstName}`}
        outstandingLabel="Review queue"
        outstandingAmount={`${memberTotal} booking${memberTotal === 1 ? '' : 's'}`}
        nextDueLabel="Attention needed"
        nextDueDate={attention}
        nextDueHint="Approve to CEO pending release, or return to accountant"
        loanCount={memberTotal}
        inArrears={0}
      />

      <ClientSectionTitle title="Legacy credit books" />
      <LoanBookTiles variant="legacy-queue" />

      <ClientSectionTitle title="Disbursement review" />
      <ClientActionGrid>
        <ClientActionTile
          icon="fact-check"
          label="Loan reviews"
          hint={`${pending} accountant bookings awaiting your sign-off`}
          variant="accent"
          onPress={() => router.push('/(staff)/operations-assistant/reviews' as Href)}
        />
        <ClientActionTile
          icon="payment"
          label="Repayments"
          hint="Current loans and the SME / Group legacy book"
          variant="accent"
          onPress={() => router.push('/(staff)/operations-assistant/repayments' as Href)}
        />
        <ClientActionTile
          icon="event"
          label="Repayment ledger"
          hint="Recorded receipts — view only"
          onPress={() => router.push('/(staff)/repayments?tab=due' as Href)}
        />
        <ClientActionTile
          icon="account-balance"
          label="Funded loans"
          hint="Branch loan book after release"
          onPress={() => router.push('/(staff)/loans' as Href)}
        />
        <AiStudioActionTile />
      </ClientActionGrid>

      <ClientSectionTitle
        title="Pending reviews"
        actionLabel={pending > 0 ? 'See all' : undefined}
        onAction={pending > 0 ? () => router.push('/(staff)/operations-assistant/reviews' as Href) : undefined}
      />
      {reviews.length === 0 ? (
        <ThemedText style={styles.empty}>No disbursements are waiting for operations assistant review.</ThemedText>
      ) : (
        <View style={styles.queueList}>
          {reviews.map((group) => {
            const count = group.member_count ?? group.members?.length ?? 0;
            return (
              <Pressable
                key={String(group.application_id ?? group.group_id ?? group.group_name ?? 'group')}
                style={styles.queueRow}
                onPress={() => router.push('/(staff)/operations-assistant/reviews' as Href)}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText type="defaultSemiBold">
                    {group.group_name?.trim() || `Application #${group.application_id}`}
                  </ThemedText>
                  <ThemedText style={styles.meta}>
                    {count} member{count === 1 ? '' : 's'} · {formatMinorMWK(group.total_amount ?? 0)}
                  </ThemedText>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={ClientUI.colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
      )}
      <WorkspaceSignOut embedded={embedded} />
    </StaffScreen>
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
});
