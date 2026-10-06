import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import {
  listingRowCreditBook,
  listingRowIsAgricultural,
  type CreditBook,
  type ListingCreditBookRow,
} from '@/lib/loan-origination/origination-workflow';

export function CreditBookBadges({
  row,
  isolatedBook,
}: {
  row: ListingCreditBookRow;
  isolatedBook?: CreditBook | null;
}) {
  const book = isolatedBook ? null : listingRowCreditBook(row);
  const agricultural = listingRowIsAgricultural(row);
  if (!book && !agricultural) return null;
  return (
    <View style={styles.row}>
      {book ? (
        <View style={[styles.badge, book === 'SME' ? styles.sme : styles.group]}>
          <ThemedText style={[styles.text, book === 'SME' ? styles.smeText : styles.groupText]}>
            {book === 'SME' ? 'SME' : 'Group'}
          </ThemedText>
        </View>
      ) : null}
      {agricultural ? (
        <View style={[styles.badge, styles.agri]}>
          <ThemedText style={[styles.text, styles.agriText]}>Agricultural</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sme: { backgroundColor: CoFiColors.primary, borderColor: CoFiColors.primary },
  group: { backgroundColor: '#fff', borderColor: '#cbd5e1' },
  agri: { backgroundColor: '#ecfdf5', borderColor: '#86efac' },
  text: { fontSize: 10, fontWeight: '700' },
  smeText: { color: '#fff' },
  groupText: { color: '#334155' },
  agriText: { color: '#166534' },
});
