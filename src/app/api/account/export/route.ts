import { personalBackupFileName } from "@/domain/personal-backup";
import { exportCurrentUserBackup } from "@/services/security/personal-data-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const backup = await exportCurrentUserBackup();
    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${personalBackupFileName()}"`,
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { message: "Não foi possível gerar o backup." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
