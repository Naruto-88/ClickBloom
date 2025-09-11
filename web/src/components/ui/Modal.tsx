"use client"
import { ReactNode, useEffect } from "react"

export default function Modal({ open, onClose, children, wide, fullscreen }: { open: boolean, onClose: () => void, children: ReactNode, wide?: boolean, fullscreen?: boolean }){
  useEffect(()=>{
    const onKey = (e: KeyboardEvent) => { if(e.key==='Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  },[onClose])
  if(!open) return null
  return (
    <div className={`modal-overlay ${fullscreen? 'modal-overlay-full':''}`} onClick={onClose}>
      <div className={`modal ${wide? 'modal-wide':''} ${fullscreen? 'modal-full':''}`} onClick={e=>e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
