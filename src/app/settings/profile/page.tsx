import Link from "next/link";
import { ProfileForm } from "@/components/forms/profile-form";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentProfile } from "@/services/auth/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Informações pessoais" };

export default async function ProfilePage() {
  const { user, profile, profileError } = await getCurrentProfile();

  return (
    <AppShell>
      <main className="mx-auto grid max-w-4xl gap-7 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header>
          <Link
            href="/settings"
            className="text-sm font-bold text-emerald-700 hover:underline"
          >
            ← Voltar para Perfil
          </Link>
          <p className="mt-6 text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-700">
            Informações pessoais
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Perfil e preferências
          </h1>
          <p className="mt-2 text-slate-600">
            Mantenha seus dados básicos e sua preferência monetária atualizados.
          </p>
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {profileError || !profile ? (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
            >
              Seu perfil não pôde ser carregado. Tente novamente.
            </p>
          ) : (
            <>
              <ProfileForm
                fullName={profile.full_name}
                email={user.email ?? ""}
                preferredCurrency={profile.preferred_currency}
              />
              <p className="mt-6 border-t border-slate-200 pt-5 text-sm text-slate-500">
                Perfil criado em{" "}
                {new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "long",
                }).format(new Date(profile.created_at))}
                .
              </p>
            </>
          )}
        </section>
      </main>
    </AppShell>
  );
}
