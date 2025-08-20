/**
 * Project Basic Info Step
 * First step of project creation wizard
 */
import React from 'react';

interface ProjectBasicInfoProps {
  projectId: string;
  projectName: string;
  description: string;
  onProjectIdChange: (value: string) => void;
  onProjectNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  errors?: {
    projectId?: string;
    projectName?: string;
  };
}

export function ProjectBasicInfo({
  projectId,
  projectName,
  description,
  onProjectIdChange,
  onProjectNameChange,
  onDescriptionChange,
  errors
}: ProjectBasicInfoProps) {
  const handleProjectIdChange = (value: string) => {
    // Auto-format project ID: lowercase, replace spaces with hyphens
    const formatted = value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    onProjectIdChange(formatted);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Project Information
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Enter the basic information for your new project
        </p>
      </div>

      <div className="space-y-4">
        {/* Project Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Project Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            placeholder="My Awesome Project"
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${
              errors?.projectName 
                ? 'border-red-500' 
                : 'border-gray-300 dark:border-gray-600'
            }`}
          />
          {errors?.projectName && (
            <p className="mt-1 text-sm text-red-500">{errors.projectName}</p>
          )}
        </div>

        {/* Project ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Project ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={projectId}
            onChange={(e) => handleProjectIdChange(e.target.value)}
            placeholder="my-awesome-project"
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white font-mono text-sm ${
              errors?.projectId 
                ? 'border-red-500' 
                : 'border-gray-300 dark:border-gray-600'
            }`}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Must be at least 3 characters, lowercase letters, numbers, and hyphens only
          </p>
          {errors?.projectId && (
            <p className="mt-1 text-sm text-red-500">{errors.projectId}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="A brief description of your project..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
        </div>
      </div>
    </div>
  );
}