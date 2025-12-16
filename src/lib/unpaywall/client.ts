/**
 * Unpaywall API Client
 * https://unpaywall.org/products/api
 *
 * Unpaywall provides free, legal access to OA versions of scholarly articles.
 * Rate limit: 100,000 requests/day with email identification.
 */

import axios from 'axios';

const UNPAYWALL_BASE_URL = 'https://api.unpaywall.org/v2';
const DEFAULT_EMAIL = 'citebite@example.com';
const REQUEST_TIMEOUT = 10000; // 10 seconds

/**
 * Unpaywall API response for a single DOI
 */
interface UnpaywallResponse {
  doi: string;
  is_oa: boolean;
  best_oa_location?: {
    url?: string;
    url_for_pdf?: string;
    license?: string;
    host_type?: string;
    version?: string;
  } | null;
  oa_locations?: Array<{
    url?: string;
    url_for_pdf?: string;
    license?: string;
    host_type?: string;
    version?: string;
  }>;
}

/**
 * Get the configured email for Unpaywall API
 */
function getUnpaywallEmail(): string {
  return process.env.UNPAYWALL_EMAIL || DEFAULT_EMAIL;
}

/**
 * Get PDF URL for a DOI using Unpaywall API
 *
 * @param doi - DOI string (e.g., "10.1234/example")
 * @returns PDF URL if available, null otherwise
 */
export async function getPdfUrl(doi: string): Promise<string | null> {
  const email = getUnpaywallEmail();

  try {
    const response = await axios.get<UnpaywallResponse>(
      `${UNPAYWALL_BASE_URL}/${encodeURIComponent(doi)}`,
      {
        params: { email },
        timeout: REQUEST_TIMEOUT,
        headers: {
          Accept: 'application/json',
        },
      }
    );

    const data = response.data;

    // Check if the paper is Open Access
    if (!data.is_oa) {
      console.log(`[Unpaywall] DOI ${doi} is not Open Access`);
      return null;
    }

    // First, try best_oa_location for PDF URL
    if (data.best_oa_location?.url_for_pdf) {
      console.log(
        `[Unpaywall] Found PDF URL for DOI ${doi}: ${data.best_oa_location.url_for_pdf}`
      );
      return data.best_oa_location.url_for_pdf;
    }

    // Fallback: check oa_locations for any PDF URL
    if (data.oa_locations) {
      for (const location of data.oa_locations) {
        if (location.url_for_pdf) {
          console.log(
            `[Unpaywall] Found PDF URL from oa_locations for DOI ${doi}: ${location.url_for_pdf}`
          );
          return location.url_for_pdf;
        }
      }
    }

    // No PDF URL found, try landing page URL as fallback (may redirect to PDF)
    if (data.best_oa_location?.url) {
      console.log(
        `[Unpaywall] No direct PDF URL, using landing page for DOI ${doi}: ${data.best_oa_location.url}`
      );
      return data.best_oa_location.url;
    }

    console.log(`[Unpaywall] No usable URL found for DOI ${doi}`);
    return null;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        console.log(`[Unpaywall] DOI ${doi} not found in Unpaywall database`);
        return null;
      }
      console.error(
        `[Unpaywall] API error for DOI ${doi}: ${error.response?.status} ${error.message}`
      );
    } else {
      console.error(`[Unpaywall] Error fetching DOI ${doi}:`, error);
    }
    return null;
  }
}

/**
 * UnpaywallClient class for consistency with other clients
 */
export class UnpaywallClient {
  async getPdfUrl(doi: string): Promise<string | null> {
    return getPdfUrl(doi);
  }
}

// Export singleton instance
export const unpaywallClient = new UnpaywallClient();
