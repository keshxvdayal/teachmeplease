import { db } from "@/lib/db";
import { assertAdmin, errorResponse } from "@/lib/http";
import { toCsv } from "@/lib/waitlist/service";

export const dynamic = "force-dynamic";

/** CSV export: curl -H "Authorization: Bearer $ADMIN_TOKEN" .../api/admin/waitlist > waitlist.csv */
export async function GET(req: Request) {
  try {
    assertAdmin(req);
    const rows = await db.waitlistEntry.findMany({ orderBy: { createdAt: "asc" } });
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
