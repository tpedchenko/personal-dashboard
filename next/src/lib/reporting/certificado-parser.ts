/**
 * Parser for Certificado de Retenciones e Ingresos a Cuenta (annual tax certificate).
 * Extracts annual totals from employer certificate PDF text.
 */

export interface ParsedCertificado {
  year: number;
  workerNie: string;
  workerName: string;
  employerNif: string;
  employerName: string;
  // Rendimientos del trabajo
  dinerariasIntegro: number;     // Importe íntegro satisfecho (gross dinerarias)
  dinerariasRetenciones: number; // Retenciones practicadas (IRPF withheld)
  especieValoracion: number;     // En especie - Valoración
  especieIngresos: number;       // En especie - Ingresos a cuenta
  especieRepercutidos: number;   // Ingresos a cuenta repercutidos
  // Gastos deducibles
  gastosDeducibles: number;      // Art 19.2 (SS contributions)
  // Dietas y rentas exentas
  dietas: number;                // Dietas exceptuadas de gravamen
  rentasExentas: number;         // Rentas exentas del IRPF (mod 190)
  // Aportaciones
  cuotaSindical: number;
  aportPensiones: number;
  // Calculated
  totalGross: number;            // dinerarias + especie
  totalRetenciones: number;      // retenciones + ingresos a cuenta
  effectiveRate: number;         // retenciones / gross * 100
}

function parseNum(text: string, pattern: RegExp): number {
  const m = text.match(pattern);
  if (!m) return 0;
  // Spanish number format: 90.638,25 → 90638.25
  return parseFloat(m[1].replace(/\./g, "").replace(",", ".")) || 0;
}

function findAmount(text: string, after: string): number {
  const idx = text.indexOf(after);
  if (idx === -1) return 0;
  const chunk = text.substring(idx + after.length, idx + after.length + 200);
  // Find first number pattern (Spanish format: 1.234,56)
  const m = chunk.match(/(\d[\d.]*,\d{2})/);
  if (!m) return 0;
  return parseFloat(m[1].replace(/\./g, "").replace(",", ".")) || 0;
}

export function parseCertificadoText(text: string): ParsedCertificado | null {
  // Must contain "Certificado de retenciones"
  if (!text.toLowerCase().includes("certificado de retenciones")) return null;

  // Year — "Datos correspondientes al ejercicio 2024"
  const yearMatch = text.match(/al\s+e\s*je\s*rcicio\s+(\d{4})/i) || text.match(/ejercicio\s+(\d{4})/i);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear() - 1;

  // Worker NIE/NIF
  const nieMatch = text.match(/([XYZ]\d{7}[A-Z])/);
  const workerNie = nieMatch ? nieMatch[1] : "";

  // Worker name
  const nameMatch = text.match(/([XYZ]\d{7}[A-Z])\s*([A-ZÁÉÍÓÚÑ\s]+)/);
  const workerName = nameMatch ? nameMatch[2].trim() : "";

  // Employer NIF
  const nifMatch = text.match(/([AB]\d{8})/);
  const employerNif = nifMatch ? nifMatch[1] : "";

  // Employer name
  const empNameMatch = text.match(/([AB]\d{8})\s*\n\s*([A-ZÁÉÍÓÚÑ\s,]+)/);
  const employerName = empNameMatch ? empNameMatch[2].trim() : "";

  // Dinerarias: first two big numbers after "Dinerarias"
  // Pattern: "90.638,25        27.835,00"
  const dinerariasMatch = text.match(/(\d[\d.]*,\d{2})\s+(\d[\d.]*,\d{2})\s*\n\s*Dinerarias/);
  let dinerariasIntegro = 0;
  let dinerariasRetenciones = 0;
  if (dinerariasMatch) {
    dinerariasIntegro = parseFloat(dinerariasMatch[1].replace(/\./g, "").replace(",", "."));
    dinerariasRetenciones = parseFloat(dinerariasMatch[2].replace(/\./g, "").replace(",", "."));
  }

  // En especie: valoracion, ingresos a cuenta, repercutidos
  // Pattern: "10,11            \n10,11            \n32,80"
  const especieMatch = text.match(/(\d[\d.]*,\d{2})\s+\n\s*(\d[\d.]*,\d{2})\s+\n\s*(\d[\d.]*,\d{2})\s+\n\s*En especie/);
  let especieValoracion = 0, especieIngresos = 0, especieRepercutidos = 0;
  if (especieMatch) {
    especieRepercutidos = parseFloat(especieMatch[1].replace(/\./g, "").replace(",", "."));
    especieIngresos = parseFloat(especieMatch[2].replace(/\./g, "").replace(",", "."));
    especieValoracion = parseFloat(especieMatch[3].replace(/\./g, "").replace(",", "."));
  }

  // Gastos deducibles (SS contributions)
  const gastosDeducibles = parseNum(text, /Gastos fiscalmente deducibles[\s\S]*?(\d[\d.]*,\d{2})/);

  // Dietas - number before or after "Dietas y asignaciones" / "exceptuadas de gravamen"
  const dietasMatch = text.match(/(\d[\d.]*,\d{2})\s*\n\s*Dietas y asignaciones/);
  const dietas = dietasMatch
    ? parseFloat(dietasMatch[1].replace(/\./g, "").replace(",", "."))
    : findAmount(text, "exceptuadas de gravamen del I.R.P.F");

  // Rentas exentas - number after "Rentas exentas" or before "cuenta (mod. 190)"
  const rentasMatch = text.match(/(\d[\d.]*,\d{2})\s*\n.*(?:Fe\s*cha|Para que conste)/);
  let rentasExentas = 0;
  // Try direct pattern: number near mod. 190 line
  const rentasMatch2 = text.match(/cuenta\s*\(mod\.\s*190\)\s*[\s\S]*?(\d[\d.]*,\d{2})/);
  if (rentasMatch2) {
    rentasExentas = parseFloat(rentasMatch2[1].replace(/\./g, "").replace(",", "."));
  } else if (rentasMatch) {
    rentasExentas = parseFloat(rentasMatch[1].replace(/\./g, "").replace(",", "."));
  }

  // Cuota sindical & pensiones (at the bottom)
  const cuotaSindical = parseNum(text, /CUOTA SINDICAL\s*:\s*(\d[\d.]*,\d{2})/i);
  const aportPensiones = parseNum(text, /PENSIONES O MUTUA\s*\.?\s*:\s*(\d[\d.]*,\d{2})/i);

  const totalGross = dinerariasIntegro + especieValoracion;
  const totalRetenciones = dinerariasRetenciones + especieIngresos;
  const effectiveRate = totalGross > 0 ? Math.round((totalRetenciones / totalGross) * 10000) / 100 : 0;

  return {
    year,
    workerNie,
    workerName,
    employerNif,
    employerName,
    dinerariasIntegro,
    dinerariasRetenciones,
    especieValoracion,
    especieIngresos,
    especieRepercutidos,
    gastosDeducibles,
    dietas,
    rentasExentas,
    cuotaSindical,
    aportPensiones,
    totalGross,
    totalRetenciones,
    effectiveRate,
  };
}
