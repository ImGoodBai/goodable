/**
 * Get template icon color based on download status
 * Downloaded: Green, Online: Blue
 */
export function getTemplateIconColor(isDownloaded: boolean): string {
  return isDownloaded ? '#10b981' : '#3b82f6'; // green-500 : blue-500
}

/**
 * Get display character for template icon
 * Prefers ID over name for consistent Latin characters
 */
export function getTemplateDisplayChar(id: string, name: string): string {
  const str = id || name;
  return str.charAt(0).toUpperCase();
}
