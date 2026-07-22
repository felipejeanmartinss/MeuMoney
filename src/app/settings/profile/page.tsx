import { AppShell } from "@/components/layout/app-shell";
import { ProfileForm } from "@/components/forms/profile-form";
import { getCurrentProfile } from "@/services/auth/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meu perfil" };
export default async function ProfilePage() {
  const { user, profile, profileError } = await getCurrentProfile();
  return <AppShell><main className="mx-auto grid max-w-3xl gap-6 px-4 py-10 sm:px-6"><div><p className="text-sm font-bold uppercase tracking-widest text-blue-700">Configurações</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">Meu perfil</h1><p className="mt-2 text-slate-600">Mantenha seus dados básicos atualizados.</p></div><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">{profileError || !profile ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">Seu perfil não pôde ser carregado. Verifique se a migration da Sprint 1 foi aplicada.</p> : <><ProfileForm fullName={profile.full_name} email={user.email ?? ""} /><p className="mt-6 border-t border-slate-200 pt-5 text-sm text-slate-500">Perfil criado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(profile.created_at))}.</p></>}</section></main></AppShell>;
}
