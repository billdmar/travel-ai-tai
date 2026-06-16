import type { ReactNode } from 'react'

// STUB — pass-through wrapper so the build passes before Terminal 2 implements
// the cross-fade route transition. Terminal 2 replaces this file; keep the
// default-export `({ children }) => ReactNode` contract intact.
export default function PageTransition({ children }: { children: ReactNode }) {
  return <>{children}</>
}
