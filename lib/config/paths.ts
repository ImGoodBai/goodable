/**
 * Unified path configuration
 *
 * All project directory paths must use this module.
 * If PROJECTS_DIR is not configured, the application will fail to start.
 */

import path from 'path';
import fs from 'fs';

/**
 * Get and validate PROJECTS_DIR from environment
 */
function getProjectsDirectory(): string {
  const projectsDir = process.env.PROJECTS_DIR;

  if (!projectsDir || projectsDir.trim() === '') {
    console.error('\n❌ FATAL ERROR: PROJECTS_DIR environment variable is not set!\n');
    console.error('Please configure PROJECTS_DIR in your .env file:');
    console.error('  PROJECTS_DIR="/path/to/your/projects"\n');
    console.error('Example:');
    console.error('  PROJECTS_DIR="./data/projects"');
    console.error('  PROJECTS_DIR="/Users/yourname/my-projects"\n');
    throw new Error('PROJECTS_DIR environment variable is required but not set');
  }

  // Convert to absolute path
  const absolutePath = path.isAbsolute(projectsDir)
    ? path.resolve(projectsDir)
    : path.resolve(process.cwd(), projectsDir);

  // Ensure directory exists
  try {
    if (!fs.existsSync(absolutePath)) {
      console.log(`[PathConfig] Creating projects directory: ${absolutePath}`);
      fs.mkdirSync(absolutePath, { recursive: true });
    }

    // Verify write permissions
    fs.accessSync(absolutePath, fs.constants.W_OK | fs.constants.R_OK);

    console.log(`[PathConfig] ✅ Projects directory configured: ${absolutePath}`);
  } catch (error) {
    console.error(`\n❌ FATAL ERROR: Cannot access PROJECTS_DIR: ${absolutePath}\n`);

    if (error instanceof Error && 'code' in error) {
      if (error.code === 'EACCES') {
        console.error('Permission denied. Please check directory permissions.');
      } else if (error.code === 'ENOENT') {
        console.error('Directory does not exist and cannot be created.');
      } else {
        console.error(`Error: ${error.message}`);
      }
    }

    throw new Error(`Cannot access PROJECTS_DIR: ${absolutePath}`);
  }

  return absolutePath;
}

/**
 * Absolute path to projects directory
 * This is the single source of truth for all project paths
 */
export const PROJECTS_DIR_ABSOLUTE = getProjectsDirectory();
