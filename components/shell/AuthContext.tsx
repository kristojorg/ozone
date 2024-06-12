'use client'

import { AppBskyActorDefs, BskyAgent } from '@atproto/api'
import {
  BrowserOAuthClientLoadOptions,
  isLoopbackHost,
} from '@atproto/oauth-client-browser'
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo, useState } from 'react'

import { PLC_DIRECTORY_URL, SOCIAL_APP_URL } from '@/lib/constants'
import { usePathname, useRouter } from 'next/navigation'
import { OAuth, useOAuth } from '../../lib/useOAuth'
import { queryClient } from 'components/QueryClient'

export type Profile = AppBskyActorDefs.ProfileViewDetailed

const AuthContext = createContext<OAuth | null>(null)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname()
  const router = useRouter()

  const [oauthOptions] = useState<BrowserOAuthClientLoadOptions>(() => ({
    clientId:
      typeof window === 'undefined' || isLoopbackHost(window.location.hostname)
        ? 'auto'
        : new URL(`/oauth-client.json`, window.location.origin).href,
    plcDirectoryUrl: PLC_DIRECTORY_URL,
    handleResolver: SOCIAL_APP_URL,
  }))

  const auth = useOAuth(oauthOptions, {
    getState: async () => {
      return pathname
    },
    onRestored: async (agent) => {
      if (agent) {
        if (pathname === '/') {
          router.push('/reports')
        }
      } else {
        // Nothing to do, LoginModal will be shown.
      }
    },
    onSignedIn: async (agent, state) => {
      if (state) router.push(state)
      else if (pathname === '/') router.push('/reports')
    },
    onSignedOut: async () => {
      console.error('Signed out') // XXX
      // Clear all cached queries when signing out
      queryClient.removeQueries()
    },
  })

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

export const useAuthContext = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error(`useAuthContext() requires an AuthProvider`)
  return context
}

export function usePdsAgent() {
  const { pdsAgent } = useAuthContext()
  return pdsAgent
}

export const useAuthDid = () => {
  return useAuthContext().pdsAgent?.did
}

export const useAuthProfileQuery = () => {
  const pds = usePdsAgent()
  return useQuery({
    enabled: !!pds,
    queryKey: ['profile', pds?.did ?? null],
    queryFn: async () => pds!.getProfile({ actor: pds!.getDid() }),
  })
}

export const useAuthProfile = () => {
  const profileQuery = useAuthProfileQuery()
  return profileQuery.data?.data
}

export const useAuthHandle = () => {
  return useAuthProfile()?.handle
}

export const useAuthIdentifier = () => {
  const handle = useAuthHandle()
  const did = useAuthDid()
  return handle ?? did
}
