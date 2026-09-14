import { buildResumePdf } from "@/lib/resume-pdf";

export const dynamic = "force-static";

export function GET() {
  return new Response(buildResumePdf(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="sid-jain-resume.pdf"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
