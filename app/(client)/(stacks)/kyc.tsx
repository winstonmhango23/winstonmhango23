import { useRouter } from 'expo-router';
import { ClientScreen } from '@/components/client-ui';
import { ClientKycForm } from '@/components/client-kyc/client-kyc-form';
import { kycScreenCopy } from '@/lib/client-portal/kyc-data-normalizer';
import { navigateBackToProfile } from '@/lib/client-portal/profile-navigation';
import { useClientSessionStore } from '@/store/client-session';

export default function ClientShellKycScreen() {
  const router = useRouter();
  const session = useClientSessionStore((s) => s.session);
  const copy = kycScreenCopy(session?.client_type);

  return (
    <ClientScreen
      scroll
      header={{
        title: 'KYC verification',
        subtitle: copy.shellSubtitle,
        showBack: true,
        onBack: () => navigateBackToProfile(router),
      }}
    >
      <ClientKycForm variant="in-shell" />
    </ClientScreen>
  );
}
