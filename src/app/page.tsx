'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FolderOpenIcon, ClockIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { UIColors } from '@/lib/colors'
import ParticleBackground from '@/components/ParticleBackground'

interface RecentProject {
  path: string
  name: string
  lastOpened: string
}

export default function Home() {
  const router = useRouter()
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [isTauri, setIsTauri] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check if running in Tauri
    const tauriAvailable = !!(window as any).__TAURI_INTERNALS__
    setIsTauri(tauriAvailable)
    setIsLoading(false)

    // Load recent projects from localStorage
    const stored = localStorage.getItem('recentProjects')
    if (stored) {
      try {
        setRecentProjects(JSON.parse(stored))
      } catch (e) {
        console.error('Failed to load recent projects:', e)
      }
    }
  }, [])

  const openProjectFolder = async () => {
    if (!isTauri) {
      alert('This feature is only available in the desktop app')
      return
    }

    try {
      const { open } = await import('@tauri-apps/plugin-dialog')

      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Lean Project Folder'
      })

      if (selected) {
        const path = selected as string
        const name = path.split('/').pop() || 'Untitled Project'

        // Save to recent projects
        const newProject: RecentProject = {
          path,
          name,
          lastOpened: new Date().toISOString()
        }

        const updated = [newProject, ...recentProjects.filter(p => p.path !== path)].slice(0, 10)
        setRecentProjects(updated)
        localStorage.setItem('recentProjects', JSON.stringify(updated))

        // Navigate to local editor with project path
        router.push(`/local/edit?path=${encodeURIComponent(path)}`)
      }
    } catch (error) {
      console.error('Failed to open folder:', error)
      alert('Failed to open folder')
    }
  }

  const openRecentProject = (project: RecentProject) => {
    // Update last opened time
    const updated = [
      { ...project, lastOpened: new Date().toISOString() },
      ...recentProjects.filter(p => p.path !== project.path)
    ].slice(0, 10)
    setRecentProjects(updated)
    localStorage.setItem('recentProjects', JSON.stringify(updated))

    router.push(`/local/edit?path=${encodeURIComponent(project.path)}`)
  }

  const removeRecentProject = (e: React.MouseEvent, projectPath: string) => {
    e.stopPropagation() // Prevent opening the project
    const updated = recentProjects.filter(p => p.path !== projectPath)
    setRecentProjects(updated)
    localStorage.setItem('recentProjects', JSON.stringify(updated))
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white/60">Loading...</div>
      </div>
    )
  }

  if (!isTauri) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-mono text-white mb-4">Astrolabe</h1>
          <p className="text-white/60 text-sm">
            Please run this application in Tauri desktop mode
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-white relative overflow-hidden bg-black">
      {/* Particle background - with connection effect */}
      <ParticleBackground particleCount={120} connectionDistance={150} mouseRadius={250} />

      <div className="relative z-10 p-8 max-w-4xl mx-auto pt-20">
        {/* Logo and title */}
        <div className="mb-10">
          <h1
            className="text-4xl font-bold tracking-[0.2em] mb-2"
            style={{ color: UIColors.core.cream }}
          >
            ASTROLABE
          </h1>
          <p
            className="text-sm tracking-wider"
            style={{ color: UIColors.core.steelBlue }}
          >
            Astrolabe your Lean
          </p>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 gap-4 mb-10">
          <button
            onClick={openProjectFolder}
            className="p-6 rounded-lg transition-all duration-300 flex items-center justify-center gap-3 group hover:scale-[1.02]"
            style={{
              background: `${UIColors.neutral.panel}80`,
              border: `1px solid ${UIColors.neutral.border}`
            }}
          >
            <FolderOpenIcon className="w-6 h-6 transition-colors" style={{ color: UIColors.core.cream }} />
            <span className="text-lg font-mono" style={{ color: UIColors.core.cream }}>Open Project</span>
          </button>
        </div>

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <div>
            <h2
              className="text-sm font-mono mb-4 flex items-center gap-2"
              style={{ color: UIColors.neutral.lightGray }}
            >
              <ClockIcon className="w-4 h-4" />
              Recent Projects
            </h2>
            <div className="space-y-2">
              {recentProjects.map((project, index) => (
                <div
                  key={index}
                  onClick={() => openRecentProject(project)}
                  className="w-full p-4 rounded-lg transition-all duration-200 text-left group relative cursor-pointer hover:scale-[1.01]"
                  style={{
                    background: `${UIColors.neutral.panel}80`,
                    border: `1px solid ${UIColors.neutral.border}`
                  }}
                >
                  <button
                    onClick={(e) => removeRecentProject(e, project.path)}
                    className="absolute top-2 right-2 p-1 rounded hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                    style={{ color: UIColors.neutral.midGray }}
                    title="Remove from recent projects"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                  <div className="font-mono mb-1" style={{ color: UIColors.core.cream }}>
                    {project.name}
                  </div>
                  <div className="text-xs font-mono" style={{ color: UIColors.neutral.midGray }}>
                    {project.path}
                  </div>
                  <div className="text-xs mt-2" style={{ color: UIColors.neutral.darkGray }}>
                    {new Date(project.lastOpened).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
