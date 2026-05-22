// =========================================================================
// ⚠️  SAMPLE DATA — fabricated figures for the Utilities page mockup.
// =========================================================================
// These are NOT real billing values. They exist only so the page can be
// designed and reviewed before the backend is wired.
//
// When the backend is connected, this whole file is replaced by Supabase
// queries that produce the same `UtilityRecord[]` shape — nothing else on the
// page needs to change.
//
// The data deliberately includes a few interesting cases:
//   • a water-usage spike at 19 Atholl Road in Nov 2025 (a simulated leak)
//   • a couple of estimated meter readings (shown differently on the charts)
//   • properties with different category mixes (Twin Towers is rates-only)
// =========================================================================

import { CATEGORY_ORDER, type UtilityCategory } from "@/lib/categories";

export type SampleProperty = {
  id: string;
  name: string;
  suburb: string;
};

export type ReadingType = "actual" | "estimated";

// One aggregated record: the net spend (and consumption, where metered) for a
// single category, in a single month, for a single property. This is the shape
// the future backend aggregation will produce, one row per bill section.
export type UtilityRecord = {
  month: string; // "YYYY-MM"
  propertyId: string;
  category: UtilityCategory;
  amount: number; // net charge for the month, excluding VAT (Rand)
  usage: number | null; // metered consumption (kWh / kL), or null
  usageUnit: "kWh" | "kL" | null;
  readingType: ReadingType | null;
};

// Twelve months, April 2025 → March 2026. Index 0 = first month.
export const SAMPLE_MONTHS: string[] = [
  "2025-04",
  "2025-05",
  "2025-06",
  "2025-07",
  "2025-08",
  "2025-09",
  "2025-10",
  "2025-11",
  "2025-12",
  "2026-01",
  "2026-02",
  "2026-03",
];

export const SAMPLE_PROPERTIES: SampleProperty[] = [
  { id: "atholl", name: "19 Atholl Road", suburb: "Camps Bay" },
  { id: "rockaways", name: "Rockaways", suburb: "Three Anchor Bay" },
  { id: "twin-towers", name: "Twin Towers", suburb: "Three Anchor Bay" },
  { id: "vredefort", name: "3B Vredefort", suburb: "Sea Point" },
];

// -------------------------------------------------------------------------
// Per-property monthly figures. Every array below has 12 values, one per
// month in SAMPLE_MONTHS.
// -------------------------------------------------------------------------

type CategorySeries = {
  amount: number[]; // 12 monthly amounts, excluding VAT (Rand)
  usage?: number[]; // 12 monthly consumption values (kWh / kL)
  usageUnit?: "kWh" | "kL";
  estimatedMonths?: number[]; // month indexes where the reading was estimated
};

type PropertyProfile = {
  propertyId: string;
  categories: Partial<Record<UtilityCategory, CategorySeries>>;
};

const PROFILES: PropertyProfile[] = [
  // 19 Atholl Road — standalone house, full utility suite. Carries the
  // simulated water leak in November 2025.
  {
    propertyId: "atholl",
    categories: {
      rates: {
        amount: [6200, 6200, 6200, 6800, 6800, 6800, 6800, 6800, 6800, 6800, 6800, 6800],
      },
      electricity: {
        amount: [3870, 4380, 5162, 5298, 5060, 4210, 3700, 3462, 4040, 3802, 3496, 3598],
        usage: [1100, 1250, 1480, 1520, 1450, 1200, 1050, 980, 1150, 1080, 990, 1020],
        usageUnit: "kWh",
        estimatedMonths: [4, 5], // Aug & Sep 2025
      },
      water: {
        // November (index 7) is the simulated leak — 95 kL vs a ~20 kL norm.
        amount: [360, 320, 290, 305, 345, 385, 450, 4350, 620, 500, 405, 385],
        usage: [18, 16, 14, 15, 17, 19, 22, 95, 28, 24, 20, 19],
        usageUnit: "kL",
      },
      sewerage: {
        amount: [252, 224, 196, 210, 238, 266, 308, 490, 392, 336, 280, 266],
        usage: [18, 16, 14, 15, 17, 19, 22, 35, 28, 24, 20, 19],
        usageUnit: "kL",
      },
      refuse: {
        amount: [290, 290, 290, 320, 320, 320, 320, 320, 320, 320, 320, 320],
      },
      improvement_district: {
        amount: [340, 340, 340, 365, 365, 365, 365, 365, 365, 365, 365, 365],
      },
      sundry: {
        amount: [0, 45, 0, 0, 30, 0, 0, 60, 0, 25, 0, 0],
      },
    },
  },

  // Rockaways — three-unit complex. Rates, common-area electricity, refuse.
  {
    propertyId: "rockaways",
    categories: {
      rates: {
        amount: [3100, 3100, 3100, 3380, 3380, 3380, 3380, 3380, 3380, 3380, 3380, 3380],
      },
      electricity: {
        amount: [839, 901, 1056, 1118, 1087, 963, 870, 808, 901, 870, 839, 855],
        usage: [240, 260, 310, 330, 320, 280, 250, 230, 260, 250, 240, 245],
        usageUnit: "kWh",
      },
      refuse: {
        amount: [600, 600, 600, 660, 660, 660, 660, 660, 660, 660, 660, 660],
      },
      sundry: {
        amount: [0, 0, 80, 0, 0, 40, 0, 0, 55, 0, 0, 35],
      },
    },
  },

  // Twin Towers — three-unit complex, rates-only account (no VAT).
  {
    propertyId: "twin-towers",
    categories: {
      rates: {
        amount: [2700, 2700, 2700, 2950, 2950, 2950, 2950, 2950, 2950, 2950, 2950, 2950],
      },
    },
  },

  // 3B Vredefort — single sectional-title unit. Rates and electricity.
  {
    propertyId: "vredefort",
    categories: {
      rates: {
        amount: [495, 495, 495, 545, 545, 545, 545, 545, 545, 545, 545, 545],
      },
      electricity: {
        amount: [1945, 2395, 2725, 2815, 2845, 2530, 1885, 1438, 1144, 1111, 952, 973],
        usage: [620, 770, 880, 910, 920, 815, 600, 451, 353, 342, 289, 296],
        usageUnit: "kWh",
        estimatedMonths: [10], // Feb 2026
      },
      sundry: {
        amount: [0, 20, 0, 0, 0, 15, 0, 0, 0, 30, 0, 0],
      },
    },
  },
];

// -------------------------------------------------------------------------
// Flatten the per-property tables into a single record array.
// -------------------------------------------------------------------------

function buildRecords(): UtilityRecord[] {
  const records: UtilityRecord[] = [];

  for (const profile of PROFILES) {
    for (const category of CATEGORY_ORDER) {
      const series = profile.categories[category];
      if (!series) continue;

      const hasUsage = series.usage !== undefined;

      SAMPLE_MONTHS.forEach((month, i) => {
        const amount = series.amount[i];
        if (amount === 0) return; // no charge this month → no record

        const isEstimated = series.estimatedMonths?.includes(i) ?? false;

        records.push({
          month,
          propertyId: profile.propertyId,
          category,
          amount,
          usage: hasUsage ? series.usage![i] : null,
          usageUnit: hasUsage ? series.usageUnit! : null,
          readingType: hasUsage ? (isEstimated ? "estimated" : "actual") : null,
        });
      });
    }
  }

  return records;
}

export const UTILITY_RECORDS: UtilityRecord[] = buildRecords();
