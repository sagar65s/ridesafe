'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/ridesafe-sw.js', { scope:'/' }).catch(error => {
        console.warn('RideSafe notification worker could not be registered:', error)
      })
    }
  }, [])
  return null
}
