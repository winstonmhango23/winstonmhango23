import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { DocumentThumbnail } from '@/components/ui/document-thumbnail';
import { CoFiColors, Radius } from '@/constants/theme';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import {
  memberPhotoPath,
  parseAllocation,
  resolveAllocationMemberIds,
  type GroupAllocationData,
  type GroupAllocationMemberInfo,
} from '@/lib/loan-origination/group-allocation-display';
import { useAuthenticatedImageUri } from '@/lib/media/authenticated-media';
import {
  openStaffClientHref,
  staffClientDocumentsHref,
  staffClientKycHref,
  staffClientProfileHref,
} from '@/lib/staff/client-file-links';

export type { GroupAllocationData, GroupAllocationMemberInfo };

function MemberPhotoLightbox({
  name,
  photoPath,
  onClose,
}: {
  name: string;
  photoPath: string | null;
  onClose: () => void;
}) {
  const { uri, loading } = useAuthenticatedImageUri(photoPath);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.lightboxBackdrop} onPress={onClose}>
        <Pressable style={styles.lightboxCard} onPress={(e) => e.stopPropagation()}>
          <ThemedText type="defaultSemiBold" style={styles.lightboxTitle}>
            {name} — ID photo
          </ThemedText>
          {loading ? (
            <ActivityIndicator color={CoFiColors.primary} style={styles.lightboxSpinner} />
          ) : uri ? (
            <Image source={{ uri }} style={styles.lightboxImage} contentFit="contain" />
          ) : (
            <ThemedText style={styles.lightboxEmpty}>
              No ID photo on this member file.
            </ThemedText>
          )}
          <Pressable onPress={onClose} hitSlop={8} style={styles.lightboxClose}>
            <ThemedText style={styles.fileLink}>Close</ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface GroupAllocationSummaryProps {
  allocation?: GroupAllocationData | null;
  memberNameById?: Record<number, string>;
  memberById?: Record<number, GroupAllocationMemberInfo>;
  /** Show members even when the loan has no stored allocation map. */
  fallbackMemberIds?: number[];
  totalAmountMinor?: number;
  title?: string;
  /** Keep the loan/application screen underneath (native) or open a new tab (web). */
  returnTo?: string | null;
  /** Show a Reallocate button for officers/managers/admins. */
  onReallocate?: () => void;
}

export function GroupAllocationSummary({
  allocation,
  memberNameById = {},
  memberById = {},
  fallbackMemberIds,
  totalAmountMinor,
  title = 'Group member allocation',
  returnTo,
  onReallocate,
}: GroupAllocationSummaryProps) {
  const router = useRouter();
  const [lightbox, setLightbox] = useState<{
    name: string;
    photoPath: string | null;
  } | null>(null);
  const parsed = parseAllocation(allocation);
  const ids = resolveAllocationMemberIds(allocation, fallbackMemberIds);
  if (ids.length === 0) return null;

  const mode = parsed?.mode ?? 'equal';
  const lineByMember = new Map((parsed?.lines ?? []).map((l) => [l.member_client_id, l.amount_minor]));

  return (
    <View style={styles.container}>
      <ThemedText type="defaultSemiBold" style={styles.title}>
        {title}
      </ThemedText>
      {parsed ? (
        <ThemedText style={styles.mode}>
          Split mode: {mode === 'equal' ? 'Equal' : 'Custom'}
          {totalAmountMinor != null && mode === 'equal' && ids.length > 0
            ? ` · ${formatMinorMWK(Math.round(totalAmountMinor / ids.length))} per member`
            : ''}
        </ThemedText>
      ) : (
        <ThemedText style={styles.mode}>
          Tap an ID photo to enlarge it here. KYC and Documents keep this loan page open.
        </ThemedText>
      )}
      {ids.map((memberId) => {
        const info = memberById[memberId];
        const name = info?.name ?? memberNameById[memberId] ?? `Member #${memberId}`;
        const photoPath = memberPhotoPath(info);
        const minor =
          parsed && mode === 'equal' && totalAmountMinor != null && ids.length > 0
            ? Math.round(totalAmountMinor / ids.length)
            : lineByMember.get(memberId);
        return (
          <View key={memberId} style={styles.row}>
            {photoPath ? (
              <DocumentThumbnail
                uri={photoPath}
                size={40}
                onPress={() => setLightbox({ name, photoPath })}
              />
            ) : (
              <View style={styles.initialThumb} accessibilityElementsHidden>
                <ThemedText style={styles.initialText}>
                  {name.slice(0, 1).toUpperCase()}
                </ThemedText>
              </View>
            )}
            <View style={styles.memberBlock}>
              <Pressable
                onPress={() =>
                  openStaffClientHref(router, staffClientProfileHref(memberId, { returnTo }))
                }
                hitSlop={6}
              >
                <ThemedText type="defaultSemiBold" style={styles.memberName} numberOfLines={1}>
                  {name}
                </ThemedText>
              </Pressable>
              <View style={styles.fileLinks}>
                <Pressable
                  onPress={() =>
                    openStaffClientHref(router, staffClientKycHref(memberId, { returnTo }))
                  }
                  hitSlop={6}
                >
                  <ThemedText style={styles.fileLink}>KYC</ThemedText>
                </Pressable>
                <ThemedText style={styles.fileSep}>·</ThemedText>
                <Pressable
                  onPress={() =>
                    openStaffClientHref(
                      router,
                      staffClientDocumentsHref(memberId, { returnTo })
                    )
                  }
                  hitSlop={6}
                >
                  <ThemedText style={styles.fileLink}>Documents</ThemedText>
                </Pressable>
              </View>
            </View>
            <ThemedText type="defaultSemiBold">
              {minor != null ? formatMinorMWK(minor) : '—'}
            </ThemedText>
          </View>
        );
      })}
      {onReallocate && (
        <Pressable style={styles.reallocateBtn} onPress={onReallocate} hitSlop={8}>
          <MaterialIcons name="swap-horiz" size={16} color={CoFiColors.primary} />
          <ThemedText style={styles.reallocateBtnText}>Reallocate</ThemedText>
        </Pressable>
      )}
      {lightbox ? (
        <MemberPhotoLightbox
          name={lightbox.name}
          photoPath={lightbox.photoPath}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: Radius.lg,
    gap: 6,
  },
  title: { fontSize: 14, marginBottom: 4 },
  mode: { fontSize: 12, opacity: 0.7, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  memberBlock: { flex: 1, gap: 2 },
  memberName: { fontSize: 13, color: CoFiColors.primary },
  fileLinks: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fileLink: { fontSize: 12, fontWeight: '600', color: CoFiColors.primary },
  fileSep: { fontSize: 12, opacity: 0.45 },
  initialThumb: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: CoFiColors.backgroundCard,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: { fontSize: 14, fontWeight: '700', opacity: 0.55 },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: 20,
  },
  lightboxCard: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.lg,
    padding: 16,
    gap: 12,
  },
  lightboxTitle: { fontSize: 16 },
  lightboxSpinner: { marginVertical: 32 },
  lightboxImage: { width: '100%', height: 360, borderRadius: Radius.md },
  lightboxEmpty: { fontSize: 13, opacity: 0.7, paddingVertical: 16 },
  lightboxClose: { alignSelf: 'flex-end', paddingVertical: 4 },
  reallocateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: CoFiColors.primary,
    borderStyle: 'dashed',
  },
  reallocateBtnText: { fontSize: 13, fontWeight: '600', color: CoFiColors.primary },
});
