/**
 * API Test Route
 * POST /api/settings/test-api - Test Claude API connection
 */

import { NextRequest, NextResponse } from 'next/server';

interface TestApiRequest {
  cliId: string;
  apiKey: string;
  apiUrl?: string;
}

/**
 * POST /api/settings/test-api
 * Test Claude API connection with provided credentials
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as TestApiRequest;
    const { cliId, apiKey, apiUrl } = body;

    // Only support Claude for now
    if (cliId !== 'claude') {
      return NextResponse.json(
        {
          success: false,
          message: `API testing is not supported for ${cliId}`,
        },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          message: 'API Key is required',
        },
        { status: 400 }
      );
    }

    // Test the Claude API
    const baseUrl = apiUrl || 'https://api.anthropic.com';
    const testUrl = `${baseUrl}/v1/messages`;

    const testResponse = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1,
        messages: [
          {
            role: 'user',
            content: 'hi',
          },
        ],
      }),
    });

    if (testResponse.ok) {
      return NextResponse.json({
        success: true,
        message: 'API connection successful',
      });
    } else {
      // Handle specific error cases
      let errorMessage = 'API connection failed';

      if (testResponse.status === 401) {
        errorMessage = 'Invalid API Key';
      } else if (testResponse.status === 403) {
        errorMessage = 'API Key does not have permission';
      } else if (testResponse.status === 429) {
        errorMessage = 'Rate limit exceeded';
      } else {
        // Try to parse error response
        try {
          const responseText = await testResponse.text();
          try {
            const responseData = JSON.parse(responseText);
            if (responseData?.error?.message) {
              errorMessage = responseData.error.message;
            }
          } catch {
            // If not JSON, use text response
            if (responseText && responseText.length < 200) {
              errorMessage = responseText;
            }
          }
        } catch {
          // Ignore text parsing errors
        }
      }

      return NextResponse.json(
        {
          success: false,
          message: errorMessage,
        },
        { status: testResponse.status }
      );
    }
  } catch (error) {
    console.error('[API] Failed to test API:', error);

    let errorMessage = 'Network error or invalid API endpoint';
    if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        errorMessage = 'Cannot connect to API endpoint';
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      {
        success: false,
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
