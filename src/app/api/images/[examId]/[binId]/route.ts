// GET /api/images/:examId/:binId — 문항 그림 (로그인 필요)
import { getRepo, requireUser } from "@/repo";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ examId: string; binId: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return new Response("로그인이 필요합니다", { status: auth.status });
  const { examId, binId } = await params;
  const im = await (await getRepo()).getImage(examId, binId);
  if (!im) return new Response("없음", { status: 404 });
  return new Response(Buffer.from(im.data), { headers: { "content-type": im.mime, "cache-control": "private, max-age=31536000, immutable" } });
}
