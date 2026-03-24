/**
 * Parser for Spanish nóminas (payslips) from PDF text.
 * Extracts salary components, IRPF, SS contributions from pdftotext output.
 */

export interface NominaComponent {
  code: string;
  name: string;
  amount: number;
}

export interface ParsedNomina {
  employer: string;
  employerNif: string;
  workerName: string;
  workerNie: string;
  period: string; // "2025-11"
  year: number;
  month: number;
  // Devengos (earnings)
  baseSalary: number;
  plusConvenio: number;
  antiguedad: number;
  absorbible: number;
  ppExtra: number;
  bonus: number;
  grossPay: number; // T. DEVENGADO
  // IRPF
  baseIrpf: number;
  irpfPct: number;
  irpfWithheld: number;
  // Seguridad Social
  baseSS: number;
  ssContComunes: number;
  ssMei: number;
  ssDesempleo: number;
  ssFormacion: number;
  ssSolidaridad: number;
  ssTotal: number;
  // Retribución flexible
  chequeRestaurante: number;
  chequeTransporte: number;
  seguroMedico: number;
  // Result
  netPay: number; // LIQUIDO A PERCIBIR
  costEmpresa: number;
  // Components
  components: NominaComponent[];
}

const MONTH_MAP: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};

function parseSpanishNumber(s: string): number {
  if (!s) return 0;
  // Spanish format: 1.234,56 → 1234.56
  return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
}

function extractNumber(text: string, pattern: RegExp): number {
  const m = text.match(pattern);
  return m ? parseSpanishNumber(m[1]) : 0;
}

export function parseNominaText(text: string): ParsedNomina | null {
  if (!text || text.length < 100) return null;

  // Detect period: "MENS 01 NOV 25 a 30 NOV 25" or "01 DIC 25"
  let year = 0;
  let month = 0;
  const periodMatch = text.match(/MENS\s+\d+\s+(\w+)\s+(\d{2})\s+a\s+\d+\s+(\w+)\s+(\d{2})/i);
  if (periodMatch) {
    const monthName = periodMatch[3].toUpperCase();
    month = MONTH_MAP[monthName] || 0;
    year = 2000 + parseInt(periodMatch[4]);
  }
  if (!month) {
    // Fallback: look for date line like "30 NOVIEMBRE"
    const dateMatch = text.match(/\d+\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)/i);
    if (dateMatch) {
      month = MONTH_MAP[dateMatch[1].toUpperCase()] || 0;
    }
  }
  if (!year) {
    const yearMatch = text.match(/(?:RECIBI|PERIODO)\s*\n?\s*(\d{4})/);
    if (yearMatch) year = parseInt(yearMatch[1]);
  }
  if (!year || !month) return null;

  // Employer
  const employerMatch = text.match(/NIF\.\s*([\w\d]+)\s*\n[\s\S]*?\n\s*EMPRESA\s*\n[\s\S]*?\n\s*(.+?)(?:\n|TRABAJADOR)/);
  const employer = employerMatch?.[2]?.trim() || "";
  const employerNif = employerMatch?.[1]?.trim() || "";

  // Worker
  const workerMatch = text.match(/D\.N\.I\.\s*\n\s*([\w\d]+)/);
  const workerNie = workerMatch?.[1]?.trim() || "";
  const workerNameMatch = text.match(/^([A-Z\s]+)\n\s*(?:PJ|CUANTIA)/m);
  const workerName = workerNameMatch?.[1]?.trim() || "";

  const components: NominaComponent[] = [];

  // Strategy: each line has a concept label and the LAST number on that line is the amount.
  // Extract amount from line by taking the last Spanish number match.
  function lastAmount(line: string): number {
    const nums = line.match(/(?:\d{1,3}\.)*\d{1,3},\d{2}/g);
    return nums ? parseSpanishNumber(nums[nums.length - 1]) : 0;
  }

  // Find amounts by matching concept labels in each line
  let baseSalary = 0, plusConvenio = 0, antiguedad = 0, absorbible = 0, ppExtra = 0, bonus = 0;
  let chequeRestaurante = 0, chequeTransporte = 0, seguroMedico = 0;
  let ssContComunes = 0, ssMei = 0, ssSolidaridad = 0, ssFormacion = 0, ssDesempleo = 0;
  let irpfWithheld = 0;

  const lines = text.split("\n");
  for (const line of lines) {
    const val = lastAmount(line);
    if (!val) continue;

    if (/Salario Base/i.test(line)) { baseSalary = val; components.push({ code: "1", name: "Salario Base", amount: val }); }
    else if (/Plus Convenio/i.test(line)) { plusConvenio = val; components.push({ code: "2", name: "Plus Convenio", amount: val }); }
    else if (/Antig[üu]edad/i.test(line)) { antiguedad = val; components.push({ code: "4", name: "Antigüedad", amount: val }); }
    else if (/Absorbible/i.test(line)) { absorbible = val; components.push({ code: "31", name: "Absorbible", amount: val }); }
    else if (/P\.?P\.?(?:P\.?)?\s*Extra/i.test(line)) { ppExtra = val; components.push({ code: "34", name: "P.P.P. Extra", amount: val }); }
    else if (/Bonus/i.test(line) && !/Dcto/i.test(line)) { bonus = val; components.push({ code: "125", name: "Bonus", amount: val }); }
    else if (/Cheque\s*Restaurante/i.test(line)) { chequeRestaurante = val; components.push({ code: "304", name: "Cheque Restaurante", amount: val }); }
    else if (/Cheque\s*Transporte/i.test(line)) { chequeTransporte = val; components.push({ code: "305", name: "Cheque Transporte", amount: val }); }
    else if (/[Ss]eguro\s*[Mm][eé]dico/i.test(line) && !/Exc/i.test(line)) { seguroMedico = val; components.push({ code: "128", name: "Seguro médico", amount: val }); }
    else if (/COTIZACION\s+CONT\.?COMU/i.test(line)) { ssContComunes = val; }
    else if (/COTIZACION\s+MEI/i.test(line)) { ssMei = val; }
    else if (/COTIZACION\s+ADIC/i.test(line)) { ssSolidaridad = val; }
    else if (/COTIZACION\s+FORMACION/i.test(line)) { ssFormacion = val; }
    else if (/COTIZACION\s+DESEMPLEO/i.test(line)) { ssDesempleo = val; }
    else if (/TRIBUTACION\s+I\.?R\.?P\.?F/i.test(line)) { irpfWithheld = val; }
  }
  const ssTotal = ssContComunes + ssMei + ssDesempleo + ssFormacion + ssSolidaridad;

  // IRPF rate — first number on IRPF line (before the amount)
  const irpfLine = lines.find(l => /TRIBUTACION\s+I\.?R\.?P\.?F/i.test(l)) || "";
  const irpfNums = irpfLine.match(/(?:\d{1,3}\.)*\d{1,3},\d{2}/g);
  const irpfPct = irpfNums && irpfNums.length >= 2 ? parseSpanishNumber(irpfNums[0]) : 0;

  // Totals line — after BASE S.S. row, all totals on one line
  const afterBaseSS = text.substring(text.search(/BASE\s+S\.?S/i) || 0);
  const totalNumbers = afterBaseSS.match(/(?:\d{1,3}\.)*\d{1,3},\d{2}/g)?.map(parseSpanishNumber) || [];
  // Order: baseSS, baseAT, baseIRPF, grossPay, totalDeducir, costEmpresa
  const baseSS = totalNumbers[0] || 0;
  const baseIrpf = totalNumbers[2] || 0;
  const grossPay = totalNumbers[3] || 0;

  // Net pay and cost empresa — search from end of document
  const netPay = extractNumber(text, /LIQUIDO\s+A\s+PERCIBIR\s*\n?\s*((?:\d{1,3}\.)*\d{1,3},\d{2})/i);
  const costEmpresa = extractNumber(text, /COSTE\s+EMPRESA[:\s]*((?:\d{1,3}\.)*\d{1,3},\d{2})/i);

  const period = `${year}-${String(month).padStart(2, "0")}`;

  return {
    employer: employer || "Unknown",
    employerNif,
    workerName,
    workerNie,
    period,
    year,
    month,
    baseSalary,
    plusConvenio,
    antiguedad,
    absorbible,
    ppExtra,
    bonus,
    grossPay,
    baseIrpf,
    irpfPct,
    irpfWithheld,
    baseSS,
    ssContComunes,
    ssMei,
    ssDesempleo,
    ssFormacion,
    ssSolidaridad,
    ssTotal,
    chequeRestaurante,
    chequeTransporte,
    seguroMedico,
    netPay,
    costEmpresa,
    components,
  };
}
