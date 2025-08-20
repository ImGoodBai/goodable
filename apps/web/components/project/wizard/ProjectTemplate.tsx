/**
 * Project Template Step
 * Select a starting template for the project
 */
import React from 'react';

interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  tags: string[];
}

interface ProjectTemplateProps {
  selectedTemplate: string;
  onTemplateSelect: (templateId: string) => void;
}

const TEMPLATES: Template[] = [
  {
    id: 'nextjs-minimal',
    name: 'Next.js Minimal',
    description: 'A minimal Next.js app with TypeScript and Tailwind CSS',
    icon: '⚡',
    tags: ['React', 'TypeScript', 'Tailwind']
  },
  {
    id: 'nextjs-landing',
    name: 'Landing Page',
    description: 'Beautiful landing page with hero, features, and pricing sections',
    icon: '🎨',
    tags: ['Marketing', 'Responsive', 'SEO']
  },
  {
    id: 'nextjs-dashboard',
    name: 'Admin Dashboard',
    description: 'Full-featured admin dashboard with charts and tables',
    icon: '📊',
    tags: ['Dashboard', 'Analytics', 'Admin']
  },
  {
    id: 'nextjs-ecommerce',
    name: 'E-commerce',
    description: 'Online store with product catalog and shopping cart',
    icon: '🛍️',
    tags: ['Shop', 'Payments', 'Products']
  },
  {
    id: 'nextjs-blog',
    name: 'Blog Platform',
    description: 'Content-focused blog with MDX support',
    icon: '📝',
    tags: ['Content', 'MDX', 'SEO']
  },
  {
    id: 'nextjs-saas',
    name: 'SaaS Starter',
    description: 'Multi-tenant SaaS application with authentication',
    icon: '🚀',
    tags: ['SaaS', 'Auth', 'Multi-tenant']
  }
];

export function ProjectTemplate({
  selectedTemplate,
  onTemplateSelect
}: ProjectTemplateProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Choose a Template
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Start with a pre-configured template to speed up development
        </p>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-2 gap-4">
        {TEMPLATES.map((template) => (
          <div
            key={template.id}
            onClick={() => onTemplateSelect(template.id)}
            className={`p-4 border rounded-lg cursor-pointer transition-all ${
              selectedTemplate === template.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500 ring-opacity-50'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl flex-shrink-0">{template.icon}</div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 dark:text-white">
                  {template.name}
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {template.description}
                </p>
                
                {/* Tags */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {template.tags.map(tag => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Custom Template Option */}
      <div
        onClick={() => onTemplateSelect('custom')}
        className={`p-4 border rounded-lg cursor-pointer transition-all ${
          selectedTemplate === 'custom'
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500 ring-opacity-50'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="text-2xl">🛠️</div>
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">
              Start from Scratch
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Begin with an empty project and build everything yourself
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}