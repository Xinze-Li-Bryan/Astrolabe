/**
 * 3D Force Layout Web Worker
 *
 * Runs physics simulation off the main thread for smooth rendering.
 */

import { createWorkerHandler } from '@/lib/layout/ForceLayout3DWorker'

// Set up message handler
self.onmessage = createWorkerHandler()
