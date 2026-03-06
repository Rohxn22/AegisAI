"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { UploadDropzone } from "@/components/upload-dropzone"
import { Button } from "@/components/ui/button"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"
import { getBackendUrl } from "@/lib/api"
import { ShieldAlert, Crosshair, Terminal } from "lucide-react"

/* ---- Glitch effect hook ---- */
function useGlitch(speed: number) {
  const [offset, setOffset] = useState(0)
  const raf = useRef(0)

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReduced) return

    function tick() {
      setOffset(window.scrollY * speed)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [speed])

  return offset
}

export default function UploadPage() {
  const router = useRouter()
  const [isLoadingSample, setIsLoadingSample] = useState(false)
  const [systemReady, setSystemReady] = useState(false)

  const parallaxOffset = useGlitch(0.15)
  
  useEffect(() => {
    // Simulate system boot-up
    const timer = setTimeout(() => setSystemReady(true), 500)
    return () => clearTimeout(timer)
  }, [])

  const handleLoadSample = async () => {
    setIsLoadingSample(true)
    try {
      const res = await fetch(getBackendUrl("/api/analyze/sample"), { method: "POST" })
      if (!res.ok) throw new Error("Failed to load sample")
      const data = await res.json()

      router.push(`/dashboard?resultId=${data.result_id}`)
    } catch (error) {
      console.error("Analysis Failed:", error)
    } finally {
      setIsLoadingSample(false)
    }
  }

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#020202] text-green-500 font-mono" style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>

      {/* ---- Cyber Grid Background ---- */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 255, 0, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 0, 0.2) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
          transform: `translateY(${parallaxOffset}px)`, 
          willChange: "transform"
        }}
      />

      {/* ---- Scanline Overlay ---- */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10 mix-blend-overlay"
        style={{
          background: "linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.2))",
          backgroundSize: "100% 4px"
        }}
      />

      {/* ---- Core Layout ---- */}
      <div className="relative z-10 container mx-auto flex min-h-screen flex-col items-center justify-center px-4">
        
        <div className={`w-full max-w-2xl transition-all duration-1000 transform ${systemReady ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
          
          <div className="border border-green-500/30 bg-black/60 backdrop-blur-md p-8 shadow-[0_0_30px_rgba(0,255,0,0.1)] relative">
            {/* Corner Accents */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-green-500" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-green-500" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-green-500" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-green-500" />

            {/* Header Section */}
            <div className="text-center mb-10 space-y-4">
              <div className="inline-flex items-center justify-center gap-2 mb-4 border border-green-500/50 px-4 py-1.5 bg-green-500/10 text-green-400 text-xs tracking-widest uppercase">
                <Terminal className="w-4 h-4" />
                <span>System Status: Online</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase text-white drop-shadow-[0_0_10px_rgba(0,255,0,0.5)] flex items-center justify-center gap-3">
                <ShieldAlert className="w-10 h-10 text-green-500" />
                AegisAI
              </h1>
              
              <p className="text-green-500/70 text-sm md:text-base max-w-md mx-auto leading-relaxed">
                Advanced threat detection protocol. Upload transaction logs to initialize heuristic structural analysis.
              </p>
            </div>

            {/* Upload Section */}
            <div className="mb-8 border border-dashed border-green-500/30 p-2 bg-black/40">
              <UploadDropzone />
            </div>

            {/* Action Section */}
            <div className="flex flex-col items-center border-t border-green-500/20 pt-8 mt-4">
              <Button
                onClick={handleLoadSample}
                disabled={isLoadingSample}
                className="w-full md:w-auto px-12 py-6 text-sm font-bold tracking-widest uppercase bg-transparent border-2 border-green-500 text-green-500 hover:bg-green-500 hover:text-black transition-all duration-300 group relative overflow-hidden"
              >
                {/* Glitch hover effect overlay */}
                <span className="absolute inset-0 bg-green-400/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out" />
                
                <span className="relative flex items-center gap-3 z-10">
                  {isLoadingSample ? (
                    <>
                      <div className="h-4 w-4 border-2 border-current border-t-transparent animate-spin rounded-full" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Crosshair className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      Initialize Demo Protocol
                    </>
                  )}
                </span>
              </Button>
              
              <div className="mt-6 flex items-center gap-2 text-[10px] text-green-500/40 uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-green-500/50 animate-pulse" />
                Awaiting Data Input
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  )
}
