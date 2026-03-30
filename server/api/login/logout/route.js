import { getPrisma } from "@/lib/prisma";
import { validateSession } from "@/lib/validateSession";

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
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
