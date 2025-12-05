/**
 * Path utility functions for displaying file paths in the UI
 */

/**
 * Converts an absolute file path to a project-relative path
 * Removes the system path prefix and shows only the path relative to the project root
 *
 * @param absolutePath - The absolute file path (e.g., /Users/jjh/Downloads/Claudable-v2/src/app/page.tsx)
 * @returns The relative path from project root (e.g., /src/app/page.tsx)
 *
 * @example
 * toRelativePath('/Users/jjh/Downloads/Claudable-v2/src/app/page.tsx')
 * // Returns: '/src/app/page.tsx'
 */
export function toRelativePath(absolutePath: string): string {
  if (!absolutePath) return absolutePath;

  // If the string looks like plain text (contains whitespace), return as-is
  if (/\s/.test(absolutePath)) {
    return absolutePath;
  }

  // Check if this is an absolute path
  const isAbsolutePath =
    absolutePath.startsWith('/') ||
    absolutePath.startsWith('\\') ||
    /^[A-Za-z]:[\\\/]/.test(absolutePath); // Windows path like C:\

  if (!isAbsolutePath) {
    return absolutePath;
  }

  // Get the project root from environment variable (injected by next.config.js)
  const projectRoot = process.env.NEXT_PUBLIC_PROJECTS_DIR_ABSOLUTE;

  if (projectRoot) {
    // Normalize both paths to use forward slashes for comparison
    const normalizedPath = absolutePath.replace(/\\/g, '/');
    const normalizedRoot = projectRoot.replace(/\\/g, '/');

    if (normalizedPath.startsWith(normalizedRoot)) {
      // Remove the project root and return with leading slash
      let relativePath = normalizedPath.substring(normalizedRoot.length);

      return relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    }
  }
  return absolutePath;
}

/**
 * Extracts the filename from a file path
 *
 * @param path - The file path
 * @returns The filename (last segment of the path)
 *
 * @example
 * getFileName('src/app/page.tsx')
 * // Returns: 'page.tsx'
 */
export function getFileName(path: string): string {
  if (!path) return path;
  const parts = path.split(/[/\\]/); // Handle both / and \ separators
  return parts[parts.length - 1] || path;
}

/**
 * Extracts the directory path (without the filename)
 *
 * @param path - The file path
 * @returns The directory path
 *
 * @example
 * getDirectoryPath('src/app/page.tsx')
 * // Returns: 'src/app'
 */
export function getDirectoryPath(path: string): string {
  if (!path) return path;
  const parts = path.split(/[/\\]/); // Handle both / and \ separators
  parts.pop(); // Remove the filename
  return parts.join('/') || '/';
}
