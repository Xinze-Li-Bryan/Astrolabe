'use client'

import { useEffect, useRef } from 'react'
import { UIColors, ParticleColors } from '@/lib/colors'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  opacity: number
}

interface ParticleBackgroundProps {
  particleCount?: number
  connectionDistance?: number
  mouseRadius?: number
}

export default function ParticleBackground({
  particleCount = 60,
  connectionDistance = 120,
  mouseRadius = 150,
}: ParticleBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const particlesRef = useRef<Particle[]>([])
  const animationRef = useRef<number>(undefined)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Particle colors
    const colors = ParticleColors

    // Initialize particles
    const initParticles = () => {
      particlesRef.current = []
      for (let i = 0; i < particleCount; i++) {
        particlesRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          size: Math.random() * 1.5 + 0.8,
          color: colors[Math.floor(Math.random() * colors.length)],
          opacity: Math.random() * 0.4 + 0.6, // Higher opacity makes colors brighter
        })
      }
    }
    initParticles()

    // Mouse movement
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 }
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseleave', handleMouseLeave)

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const particles = particlesRef.current
      const mouse = mouseRef.current

      // Calculate if each particle has connections
      const hasConnection: boolean[] = new Array(particles.length).fill(false)

      // Check particles within mouse range
      particles.forEach((p, i) => {
        const mouseDx = p.x - mouse.x
        const mouseDy = p.y - mouse.y
        const mouseDistance = Math.sqrt(mouseDx * mouseDx + mouseDy * mouseDy)
        if (mouseDistance < mouseRadius) {
          hasConnection[i] = true
        }
      })

      // Update and draw particles
      particles.forEach((p, i) => {
        // Update position
        p.x += p.vx
        p.y += p.vy

        // Boundary bounce
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1

        // Keep within boundaries
        p.x = Math.max(0, Math.min(canvas.width, p.x))
        p.y = Math.max(0, Math.min(canvas.height, p.y))

        // Determine particle size based on connection
        const displaySize = hasConnection[i] ? p.size : p.size * 0.5 // Smaller when no connections, like dust particles
        const displayOpacity = hasConnection[i] ? p.opacity : p.opacity * 0.7 // Slightly faded but still visible when no connections

        // Draw particle
        ctx.beginPath()
        ctx.arc(p.x, p.y, displaySize, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha = displayOpacity
        ctx.fill()
        ctx.globalAlpha = 1

        // Connect particles near mouse (stronger effect)
        const mouseDx = p.x - mouse.x
        const mouseDy = p.y - mouse.y
        const mouseDistance = Math.sqrt(mouseDx * mouseDx + mouseDy * mouseDy)

        if (mouseDistance < mouseRadius) {
          // Connect to mouse
          const opacity = (1 - mouseDistance / mouseRadius) * 0.4
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(mouse.x, mouse.y)
          ctx.strokeStyle = UIColors.core.cream
          ctx.globalAlpha = opacity
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.globalAlpha = 1

          // Also create stronger connections between particles within mouse range
          particles.forEach((p2, j) => {
            if (i >= j) return // Avoid duplicate drawing
            const p2MouseDx = p2.x - mouse.x
            const p2MouseDy = p2.y - mouse.y
            const p2MouseDistance = Math.sqrt(p2MouseDx * p2MouseDx + p2MouseDy * p2MouseDy)

            if (p2MouseDistance < mouseRadius) {
              const dx = p.x - p2.x
              const dy = p.y - p2.y
              const distance = Math.sqrt(dx * dx + dy * dy)

              if (distance < mouseRadius) {
                const opacity = (1 - distance / mouseRadius) * 0.25
                ctx.beginPath()
                ctx.moveTo(p.x, p.y)
                ctx.lineTo(p2.x, p2.y)
                ctx.strokeStyle = UIColors.core.steelBlue
                ctx.globalAlpha = opacity
                ctx.lineWidth = 0.8
                ctx.stroke()
                ctx.globalAlpha = 1
              }
            }
          })
        }
      })

      animationRef.current = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseleave', handleMouseLeave)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [particleCount, connectionDistance, mouseRadius])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ background: 'transparent' }}
    />
  )
}
