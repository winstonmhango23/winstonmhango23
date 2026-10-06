import { useEffect } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BankingCard } from '@/components/ui/banking-card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import { useComplianceStore } from '@/store/compliance';

export default function ComplianceDashboardScreen() {
  const router = useRouter();
  const { stats, fetchStats, fetchCases, fetchChecks } = useComplianceStore();

  useEffect(() => { fetchStats(); fetchCases(); fetchChecks(); }, []);

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Compliance"
        subtitle="AML, KYC & regulatory oversight"
        icon="verified-user"
        stats={[
          { label: 'Cases', value: String(stats?.total_cases ?? '—') },
          { label: 'Open', value: String(stats?.open_cases ?? '—') },
          { label: 'AML', value: String(stats?.aml_alerts ?? 0) },
        ]}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.statsRow}>
          <BankingCard style={styles.statCard}>
            <ThemedText style={styles.statValue}>{stats?.total_cases ?? '—'}</ThemedText>
            <ThemedText style={styles.statLabel}>Total Cases</ThemedText>
          </BankingCard>
          <BankingCard style={styles.statCard}>
            <ThemedText style={styles.statValue}>{stats?.open_cases ?? '—'}</ThemedText>
            <ThemedText style={styles.statLabel}>Open</ThemedText>
          </BankingCard>
          <BankingCard style={styles.statCard}>
            <ThemedText style={[styles.statValue, (stats?.aml_alerts ?? 0) > 0 && { color: '#ef4444' }]}>
              {stats?.aml_alerts ?? 0}
            </ThemedText>
            <ThemedText style={styles.statLabel}>AML Alerts</ThemedText>
          </BankingCard>
        </View>

        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('./kyc-queue')} activeOpacity={0.7}>
            <MaterialIcons name="badge" size={24} color={CoFiColors.primary} />
            <View style={styles.menuText}>
              <ThemedText type="defaultSemiBold">KYC Verification Queue</ThemedText>
              <ThemedText style={styles.menuSub}>Review and verify client identities</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={CoFiColors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('./cases')}
            activeOpacity={0.7}
          >
            <MaterialIcons name="gavel" size={24} color={CoFiColors.primary} />
            <View style={styles.menuText}>
              <ThemedText type="defaultSemiBold">Compliance Cases</ThemedText>
              <ThemedText style={styles.menuSub}>{stats?.open_cases ?? 0} open cases requiring attention</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={CoFiColors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  scroll: { padding: 16, gap: 20 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, padding: 16, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: CoFiColors.primary, marginBottom: 4 },
  statLabel: { fontSize: 11, opacity: 0.6 },
  menuSection: { gap: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: CoFiColors.backgroundCard, padding: 16, borderRadius: Radius.md, gap: 12, borderWidth: 1, borderColor: CoFiColors.border },
  menuText: { flex: 1 },
  menuSub: { fontSize: 12, opacity: 0.65, marginTop: 2 },
});
