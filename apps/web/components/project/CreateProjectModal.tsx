/**
 * Create Project Modal (Refactored)
 * Multi-step wizard for project creation
 */
import React, { useState } from 'react';
import { ProjectBasicInfo } from './wizard/ProjectBasicInfo';
import { ProjectTemplate } from './wizard/ProjectTemplate';
import { ProjectCLISetup } from './wizard/ProjectCLISetup';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (projectId: string) => void;
}

type WizardStep = 'basic' | 'template' | 'cli' | 'creating';

export function CreateProjectModal({
  isOpen,
  onClose,
  onSuccess
}: CreateProjectModalProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('basic');
  const [isCreating, setIsCreating] = useState(false);
  
  // Form data
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('nextjs-minimal');
  const [selectedCLI, setSelectedCLI] = useState('claude');
  const [fallbackEnabled, setFallbackEnabled] = useState(true);
  
  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateBasicInfo = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!projectName.trim()) {
      newErrors.projectName = 'Project name is required';
    }
    
    if (!projectId.trim()) {
      newErrors.projectId = 'Project ID is required';
    } else if (projectId.length < 3) {
      newErrors.projectId = 'Project ID must be at least 3 characters';
    } else if (!/^[a-z0-9-]+$/.test(projectId)) {
      newErrors.projectId = 'Project ID can only contain lowercase letters, numbers, and hyphens';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (currentStep === 'basic') {
      if (validateBasicInfo()) {
        setCurrentStep('template');
      }
    } else if (currentStep === 'template') {
      setCurrentStep('cli');
    } else if (currentStep === 'cli') {
      handleCreate();
    }
  };

  const handleBack = () => {
    if (currentStep === 'cli') {
      setCurrentStep('template');
    } else if (currentStep === 'template') {
      setCurrentStep('basic');
    }
  };

  const handleCreate = async () => {
    setIsCreating(true);
    setCurrentStep('creating');
    
    try {
      // Create project
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          name: projectName,
          description,
          template: selectedTemplate,
          cli_preference: selectedCLI,
          fallback_enabled: fallbackEnabled
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create project');
      }

      const project = await response.json();
      
      // Update CLI preference
      await fetch(`/api/chat/${project.id}/cli-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferred_cli: selectedCLI,
          fallback_enabled: fallbackEnabled
        })
      });

      // Success
      onSuccess?.(project.id);
      handleClose();
    } catch (error) {
      console.error('Failed to create project:', error);
      setErrors({ create: error instanceof Error ? error.message : 'Failed to create project' });
      setCurrentStep('basic');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    // Reset form
    setCurrentStep('basic');
    setProjectId('');
    setProjectName('');
    setDescription('');
    setSelectedTemplate('nextjs-minimal');
    setSelectedCLI('claude');
    setFallbackEnabled(true);
    setErrors({});
    setIsCreating(false);
    
    onClose();
  };

  if (!isOpen) return null;

  const steps = [
    { id: 'basic', label: 'Basic Info', number: 1 },
    { id: 'template', label: 'Template', number: 2 },
    { id: 'cli', label: 'AI Assistant', number: 3 }
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={handleClose} />
      
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Create New Project
              </h2>
              <button
                onClick={handleClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Progress Steps */}
            {currentStep !== 'creating' && (
              <div className="flex items-center justify-between mt-6">
                {steps.map((step, index) => (
                  <div key={step.id} className="flex items-center flex-1">
                    <div className="flex items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                          index <= currentStepIndex
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {step.number}
                      </div>
                      <span
                        className={`ml-2 text-sm ${
                          index <= currentStepIndex
                            ? 'text-gray-900 dark:text-white font-medium'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                    {index < steps.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 mx-4 ${
                          index < currentStepIndex
                            ? 'bg-blue-500'
                            : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {currentStep === 'basic' && (
              <ProjectBasicInfo
                projectId={projectId}
                projectName={projectName}
                description={description}
                onProjectIdChange={setProjectId}
                onProjectNameChange={setProjectName}
                onDescriptionChange={setDescription}
                errors={errors}
              />
            )}

            {currentStep === 'template' && (
              <ProjectTemplate
                selectedTemplate={selectedTemplate}
                onTemplateSelect={setSelectedTemplate}
              />
            )}

            {currentStep === 'cli' && (
              <ProjectCLISetup
                selectedCLI={selectedCLI}
                fallbackEnabled={fallbackEnabled}
                onCLISelect={setSelectedCLI}
                onFallbackChange={setFallbackEnabled}
              />
            )}

            {currentStep === 'creating' && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="mt-4 text-gray-600 dark:text-gray-400">
                  Creating your project...
                </p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                  This may take a few moments
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          {currentStep !== 'creating' && (
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  {errors.create && (
                    <p className="text-sm text-red-500">{errors.create}</p>
                  )}
                </div>
                
                <div className="flex gap-3">
                  {currentStep !== 'basic' && (
                    <button
                      onClick={handleBack}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      Back
                    </button>
                  )}
                  
                  <button
                    onClick={handleNext}
                    disabled={isCreating}
                    className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {currentStep === 'cli' ? 'Create Project' : 'Next'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CreateProjectModal;