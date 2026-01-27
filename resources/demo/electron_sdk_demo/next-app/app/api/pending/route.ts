/**
 * Get pending permissions
 */

import { NextResponse } from 'next/server';
import { getPendingPermissions } from '../permissions';

export async function GET() {
  const pending = getPendingPermissions();
  return NextResponse.json({ pending });
}
