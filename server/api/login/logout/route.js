import prisma from "@/lib/prisma";
import { validateSession } from "@/lib/validateSession";

export async function POST(req) {
  const { session, error, status } = await validateSession(req);
  if (error) {
    return Response.json({ error }, { status });
  }

  await prisma.authSession.update({
    where: { id: session.id },
    data: { is_active: false },
  });

  return Response.json({ success: true });
}
