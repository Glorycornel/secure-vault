import { VaultProvider } from "@/hooks/useVault";

export default function VaultLayout({ children }: { children: React.ReactNode }) {
  return <VaultProvider>{children}</VaultProvider>;
}
