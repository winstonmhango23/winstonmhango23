import { AuthScreenShell } from '@/components/client-ui';
import { ClientKycForm } from '@/components/client-kyc/client-kyc-form';
import { kycScreenCopy } from '@/lib/client-portal/kyc-data-normalizer';
import { useClientSessionStore } from '@/store/client-session';

export default function StandaloneKycScreen() {
  const session = useClientSessionStore((s) => s.session);
  const copy = kycScreenCopy(session?.client_type);

  return (
    <AuthScreenShell
      title={copy.title}
      subtitle={copy.subtitle}
      showBack={false}
      contentStyle={{ paddingBottom: 40 }}
    >
      <ClientKycForm variant="standalone" />
    </AuthScreenShell>
  );
}
