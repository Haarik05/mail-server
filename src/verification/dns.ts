import { promises as dns } from 'dns';

export interface ResolvedHost {
  hostname: string;
  ips: string[]; // List of resolved IP addresses
  resolved: boolean;
  error?: string;
}

/**
 * Step 6: Resolve MX Hostname
 * Resolves an MX hostname to its underlying IP addresses (IPv4 and IPv6).
 *
 * @param hostname The MX server hostname (e.g. gmail-smtp-in.l.google.com)
 * @returns A promise resolving to an array of IP addresses
 */
export async function resolveMxHostname(
  hostname: string,
): Promise<ResolvedHost> {
  const ips: string[] = [];
  let errorMsg: string | undefined;

  try {
    // Attempt to resolve IPv4 addresses (A records)
    try {
      const ipv4 = await dns.resolve4(hostname);
      ips.push(...ipv4);
    } catch (v4Error: any) {
      // It's acceptable for a host to only have IPv6 or vice-versa
      if (v4Error.code !== 'ENODATA' && v4Error.code !== 'ENOTFOUND') {
        errorMsg = `IPv4 error: ${v4Error.message}`;
      }
    }

    // Attempt to resolve IPv6 addresses (AAAA records)
    try {
      const ipv6 = await dns.resolve6(hostname);
      ips.push(...ipv6);
    } catch (v6Error: any) {
      if (v6Error.code !== 'ENODATA' && v6Error.code !== 'ENOTFOUND') {
        // If IPv4 already had an error, append this one, otherwise set it
        const msg = `IPv6 error: ${v6Error.message}`;
        errorMsg = errorMsg ? `${errorMsg} | ${msg}` : msg;
      }
    }

    if (ips.length === 0 && !errorMsg) {
      errorMsg = 'No A or AAAA records could be found for this hostname.';
    }
  } catch (error: any) {
    errorMsg = error.code || error.message;
  }

  return {
    hostname,
    ips,
    resolved: ips.length > 0,
    error: errorMsg,
  };
}
