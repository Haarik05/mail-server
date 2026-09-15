import { promises as dns } from 'dns';

export interface MxRecord {
  priority: number;
  exchange: string;
}

export interface MxLookupResult {
  records: MxRecord[];
  hasMx: boolean;
  error?: string;
}

/**
 * Step 4 & 5: DNS & MX Lookup
 * Retrieves and sorts the MX records for a given domain.
 *
 * @param domain The domain extracted from the email address
 * @returns A promise resolving to the MX lookup result, sorted by priority (lowest number = highest priority)
 */
export async function getMxRecords(domain: string): Promise<MxLookupResult> {
  try {
    // Query the DNS for MX records
    const records = await dns.resolveMx(domain);

    if (!records || records.length === 0) {
      return { records: [], hasMx: false };
    }

    // Sort by priority (lowest number first)
    // The lowest priority number is the primary mail server.
    const sortedRecords = records.sort((a, b) => a.priority - b.priority);

    return {
      records: sortedRecords.map((record) => ({
        priority: record.priority,
        exchange: record.exchange,
      })),
      hasMx: true,
    };
  } catch (error: any) {
    // ENODATA or ENOTFOUND means the domain either doesn't exist or has no MX records
    return {
      records: [],
      hasMx: false,
      error: error.code || error.message,
    };
  }
}
