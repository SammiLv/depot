import { approvePersonalKpiScoring } from "@/server/kpi/actions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const result = await approvePersonalKpiScoring(formData);
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "审核失败";
    return Response.json({ error: message }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
