/**
 * Confirm or deny a pending permission
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolvePermission } from '../permissions';

export async function POST(request: NextRequest) {
  const { id, approved } = await request.json();

  console.log(`[PERMISSION] ${approved ? 'APPROVED' : 'DENIED'}: ${id}`);

  const resolved = resolvePermission(id, approved);

  if (resolved) {
    return NextResponse.json({ success: true });
  } else {
    return NextResponse.json({ success: false, error: 'Permission not found or expired' }, { status: 404 });
  }
}
