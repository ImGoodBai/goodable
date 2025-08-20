"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    prompt: string;
    created_at: string;
    last_active_at?: string;
  };
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter();
  const prefetchTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Prefetch chat page on hover
  const handleMouseEnter = () => {
    // Start prefetching after 200ms of hovering
    prefetchTimeout.current = setTimeout(() => {
      router.prefetch(`/${project.id}/chat`);
    }, 200);
  };
  
  const handleMouseLeave = () => {
    if (prefetchTimeout.current) {
      clearTimeout(prefetchTimeout.current);
      prefetchTimeout.current = null;
    }
  };
  
  useEffect(() => {
    return () => {
      if (prefetchTimeout.current) {
        clearTimeout(prefetchTimeout.current);
      }
    };
  }, []);
  
  return (
    <Link 
      href={`/${project.id}/chat`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="block bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 group transform hover:scale-[1.02]"
    >
      <div className="p-6">
        {/* Project Icon */}
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow">
            <span className="text-white text-xl font-bold">
              {project.name.charAt(0).toUpperCase()}
            </span>
          </div>
          
          {/* Status indicator */}
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-gray-500 dark:text-gray-400">Active</span>
          </div>
        </div>
        
        {/* Project Name */}
        <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {project.name}
        </h3>
        
        {/* Project Prompt */}
        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-4">
          {project.prompt || 'No description'}
        </p>
        
        {/* Footer with dates */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
          <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
          {project.last_active_at && (
            <span>Active {getRelativeTime(project.last_active_at)}</span>
          )}
        </div>
        
        {/* Hover indicator */}
        <div className="mt-4 flex items-center text-sm text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
          <span>Open project</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="ml-2" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </Link>
  );
}

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / 60000);
  
  if (diffInMinutes < 1) return 'now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  return date.toLocaleDateString();
}