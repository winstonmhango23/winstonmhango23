import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { BankingCard } from '@/components/ui/banking-card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import { useLoansStore, useClientsStore } from '@/store';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={[styles.statBox, { borderLeftColor: color ?? CoFiColors.primary, borderLeftWidth: 3 }]}>
      <ThemedText style={[styles.statValue, color ? { color } : undefined]}>{value}</ThemedText>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
    </View>
  );
}

export default function PortfolioScreen() {
  const router = useRouter();
  const { loans, fetchLoans, loading } = useLoansStore();
  const { fetchClients } = useClientsStore();

  useEffect(() => {
    fetchLoans();
    fetchClients();
  }, [fetchLoans, fetchClients]);

  const totalDisbursed = loans.reduce((s, l) => s + l.principal_amount, 0);
  const outstanding = loans.reduce((s, l) => s + l.outstanding_principal, 0);
  const activeLoans = loans.filter((l) => l.status === 'ACTIVE' || l.status === 'DISBURSED');
  const avgLoanSize = activeLoans.length > 0 ? totalDisbursed / activeLoans.length : 0;

  const stats = [
    { label: 'Disbursed', value: formatMinorMWK(totalDisbursed) },
    { label: 'Outstanding', value: formatMinorMWK(outstanding) },
    { label: 'Active', value: String(activeLoans.length) },
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Portfolio"
        subtitle="Summary, risk, and profitability"
        icon="pie-chart"
        stats={stats}
      />
      <FlatList
        style={{ flex: 1 }}
        data={[]}
        renderItem={() => null}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => { fetchLoans(); fetchClients(); }}
          />
        }
        ListHeaderComponent={
          <>
            <ThemedText style={styles.sectionTitle}>Portfolio Summary</ThemedText>
            <View style={styles.statGrid}>
              <StatBox label="Total Disbursed" value={formatMinorMWK(totalDisbursed)} color={CoFiColors.primary} />
              <StatBox label="Outstanding" value={formatMinorMWK(outstanding)} color="#0a3d7a" />
              <StatBox label="Active Loans" value={String(activeLoans.length)} color="#22c55e" />
              <StatBox label="Avg Loan Size" value={formatMinorMWK(avgLoanSize)} color="#f59e0b" />
            </View>

            <ThemedText style={[styles.sectionTitle, { marginTop: 24 }]}>Quick Links</ThemedText>
            <View style={styles.cards}>
              <TouchableOpacity onPress={() => router.push('./risk')} activeOpacity={0.7}>
                <BankingCard>
                  <View style={styles.cardInner}>
                    <View style={[styles.cardIcon, styles.cardIconDefault]}>
                      <MaterialIcons name="assessment" size={28} color="#0a3d7a" />
                    </View>
                    <View style={styles.cardText}>
                      <ThemedText style={styles.cardTitle}>Risk Analysis</ThemedText>
                      <ThemedText style={styles.cardHint}>View aging and PAR buckets</ThemedText>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color="#6b7280" />
                  </View>
                </BankingCard>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.push('./profitability')} activeOpacity={0.7}>
                <BankingCard>
                  <View style={styles.cardInner}>
                    <View style={[styles.cardIcon, styles.cardIconDefault]}>
                      <MaterialIcons name="trending-up" size={28} color="#0a3d7a" />
                    </View>
                    <View style={styles.cardText}>
                      <ThemedText style={styles.cardTitle}>Profitability</ThemedText>
                      <ThemedText style={styles.cardHint}>Interest earned and returns</ThemedText>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color="#6b7280" />
                  </View>
                </BankingCard>
              </TouchableOpacity>
            </View>
          </>
        }
        contentContainerStyle={styles.scrollContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 14, marginTop: 4 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statBox: {
    width: '46%', flexGrow: 1,
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.md,
    padding: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  cards: { gap: 14 },
  cardInner: { flexDirection: 'row', alignItems: 'center' },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(230,184,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 18,
  },
  cardIconDefault: { backgroundColor: 'rgba(10,61,122,0.1)' },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardHint: { marginTop: 4, fontSize: 13, opacity: 0.78 },
});
