export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser, isCurrentUserDemo } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { parseNominaText } from "@/lib/reporting/nomina-parser";
import { parseBrokerReport } from "@/lib/reporting/broker-parsers";
import { parseCertificadoText } from "@/lib/reporting/certificado-parser";
// @ts-expect-error pdf-parse has no type declarations
import pdfParse from "pdf-parse";

/**
 * Upload tax document (nómina PDF, broker report CSV).
 * Parses content and stores in tax_documents table.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();

    // Demo users cannot upload files
    if (await isCurrentUserDemo()) {
      return NextResponse.json({ error: "Uploads are not available in demo mode" }, { status: 403 });
    }
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const docType = formData.get("docType") as string | null; // NOMINA | BROKER_REPORT
    const source = formData.get("source") as string | null; // INTELLIAS | IBKR | TRADING212 | ETORRO
    const yearStr = formData.get("year") as string | null;

    if (!file || !docType) {
      return NextResponse.json({ error: "Missing file or docType" }, { status: 400 });
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "");

    if (docType === "NOMINA") {
      // PDF nómina
      if (ext !== ".pdf") {
        return NextResponse.json({ error: "Nómina must be PDF" }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Extract text from PDF
      let text: string;
      try {
        const pdf = await pdfParse(buffer);
        text = pdf.text;
      } catch {
        return NextResponse.json({ error: "Failed to parse PDF" }, { status: 400 });
      }

      const parsed = parseNominaText(text);
      if (!parsed) {
        return NextResponse.json({ error: "Could not extract nómina data from PDF" }, { status: 400 });
      }

      // Store in DB
      const doc = await prisma.taxDocument.upsert({
        where: {
          userId_country_docType_period_source: {
            userId: user.id,
            country: "ES",
            docType: "NOMINA",
            period: parsed.period,
            source: source || parsed.employer,
          },
        },
        create: {
          userId: user.id,
          country: "ES",
          docType: "NOMINA",
          source: source || parsed.employer,
          period: parsed.period,
          year: parsed.year,
          month: parsed.month,
          fileName: file.name,
          parsedJson: JSON.stringify(parsed),
        },
        update: {
          fileName: file.name,
          parsedJson: JSON.stringify(parsed),
        },
      });

      return NextResponse.json({ success: true, id: doc.id, parsed });
    }

    if (docType === "BROKER_REPORT") {
      // CSV or PDF broker report
      if (![".csv", ".txt", ".pdf"].includes(ext)) {
        return NextResponse.json({ error: "Broker report must be CSV or PDF" }, { status: 400 });
      }
      if (!source) {
        return NextResponse.json({ error: "Missing source (broker name)" }, { status: 400 });
      }

      let text: string;
      if (ext === ".pdf") {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        try {
          const pdf = await pdfParse(buffer);
          text = pdf.text;
        } catch {
          return NextResponse.json({ error: "Failed to parse broker PDF" }, { status: 400 });
        }
      } else {
        text = await file.text();
      }
      // Try to detect year from filename (e.g. "ibkr-U12878644.2025.fx.pdf" → 2025)
      const fileYearMatch = file.name.match(/[._-](20\d{2})[._-]/);
      const year = fileYearMatch ? parseInt(fileYearMatch[1]) : (yearStr ? parseInt(yearStr) : new Date().getFullYear());

      let report;
      try {
        report = parseBrokerReport(text, source, year);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Failed to parse broker report" },
          { status: 400 }
        );
      }

      // Use filename stem as period suffix so different reports from same broker don't overwrite
      const fileStem = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
      const period = `${year}-${fileStem}`;
      const doc = await prisma.taxDocument.upsert({
        where: {
          userId_country_docType_period_source: {
            userId: user.id,
            country: "ES",
            docType: "BROKER_REPORT",
            period,
            source: source.toUpperCase(),
          },
        },
        create: {
          userId: user.id,
          country: "ES",
          docType: "BROKER_REPORT",
          source: source.toUpperCase(),
          period,
          year,
          fileName: file.name,
          parsedJson: JSON.stringify(report),
        },
        update: {
          fileName: file.name,
          parsedJson: JSON.stringify(report),
        },
      });

      return NextResponse.json({ success: true, id: doc.id, report });
    }

    if (docType === "CERTIFICADO_RETENCIONES") {
      if (ext !== ".pdf") {
        return NextResponse.json({ error: "Certificado must be PDF" }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      let text: string;
      try {
        const pdf = await pdfParse(buffer);
        text = pdf.text;
      } catch {
        return NextResponse.json({ error: "Failed to parse PDF" }, { status: 400 });
      }

      const parsed = parseCertificadoText(text);
      if (!parsed) {
        return NextResponse.json({ error: "Could not extract certificado data from PDF" }, { status: 400 });
      }

      const period = `${parsed.year}-ANNUAL`;
      const doc = await prisma.taxDocument.upsert({
        where: {
          userId_country_docType_period_source: {
            userId: user.id,
            country: "ES",
            docType: "CERTIFICADO_RETENCIONES",
            period,
            source: source || parsed.employerName || "EMPLOYER",
          },
        },
        create: {
          userId: user.id,
          country: "ES",
          docType: "CERTIFICADO_RETENCIONES",
          source: source || parsed.employerName || "EMPLOYER",
          period,
          year: parsed.year,
          fileName: file.name,
          parsedJson: JSON.stringify(parsed),
        },
        update: {
          fileName: file.name,
          parsedJson: JSON.stringify(parsed),
        },
      });

      return NextResponse.json({ success: true, id: doc.id, parsed });
    }

    return NextResponse.json({ error: `Unknown docType: ${docType}` }, { status: 400 });
  } catch (error) {
    console.error("Tax document upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
