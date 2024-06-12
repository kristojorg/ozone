'use client'

import { BskyAgent } from '@atproto/api'
import {
  AuthorizeOptions,
  BrowserOAuthClient,
  BrowserOAuthClientLoadOptions,
  BrowserOAuthClientOptions,
  LoginContinuedInParentWindowError,
  OAuthAgent,
} from '@atproto/oauth-client-browser'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useSignaledEffect } from './useSignaledEffect'

const CURRENT_AUTHENTICATED_SUB = 'CURRENT_AUTHENTICATED_SUB'

type Options = {
  onRestored?: (agent: OAuthAgent | null) => void
  onSignedIn?: (agent: OAuthAgent, state: null | string) => void
  onSignedOut?: () => void
  getState?: () => string | Promise<string>
}

export type OAuth = {
  isInitialized: boolean
  isAuthenticating: boolean
  isLoggedIn: boolean

  signIn: (input: string) => Promise<void>
  signOut: () => Promise<void>

  oauthClient: BrowserOAuthClient | null
  oauthAgent: OAuthAgent | null
  /** An agent to use in order to communicate with the user's PDS. */
  pdsAgent: BskyAgent | undefined
}

export function useOAuth(
  config:
    | BrowserOAuthClientLoadOptions
    | BrowserOAuthClientOptions
    | BrowserOAuthClient,
  options?: Options,
): OAuth {
  const [authenticating, setAuthenticating] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const [oauthClient, setOAuthClient] = useState<null | BrowserOAuthClient>(
    () => (config instanceof BrowserOAuthClient ? config : null),
  )
  const [oauthAgent, setOAuthAgent] = useState<null | OAuthAgent>(null)

  const optionsRef = useRef(options)
  optionsRef.current = options

  useSignaledEffect(
    (signal) => {
      if (config instanceof BrowserOAuthClient) {
        setOAuthClient(config)
      } else if ('clientMetadata' in config) {
        setOAuthClient(new BrowserOAuthClient(config))
      } else if ('clientId' in config) {
        setOAuthClient(null)
        void BrowserOAuthClient.load({ ...config, signal }).then(
          (client) => {
            console.error('Loaded client:', client.clientMetadata) // XXX
            if (!signal.aborted) setOAuthClient(client)
          },
          (err) => {
            if (!signal.aborted) throw err
          },
        )
      } else {
        setOAuthClient(null)
        console.error('Invalid config:', config)
      }
    },
    [config],
  )

  useEffect(() => {
    if (!initialized) return // Process after init is over

    if (oauthAgent) {
      localStorage.setItem(CURRENT_AUTHENTICATED_SUB, oauthAgent.sub)
    } else {
      localStorage.removeItem(CURRENT_AUTHENTICATED_SUB)
    }
  }, [initialized, oauthAgent])

  const clientRef = useRef<typeof oauthClient>()
  useEffect(() => {
    // In strict mode, we don't want to reinitialize the client if it's the same
    if (clientRef.current === oauthClient) return
    clientRef.current = oauthClient

    setInitialized(false)
    setOAuthAgent(null)

    oauthClient
      ?.init(localStorage.getItem(CURRENT_AUTHENTICATED_SUB) || undefined)
      .then(
        async (r) => {
          if (clientRef.current !== oauthClient) return

          if (r) {
            setOAuthAgent(r.agent)

            if ('state' in r) {
              await optionsRef.current?.onSignedIn?.(r.agent, r.state)
            } else {
              await optionsRef.current?.onRestored?.(r.agent)
            }
          } else {
            await optionsRef.current?.onRestored?.(null)
          }
        },
        async (err) => {
          if (clientRef.current !== oauthClient) return
          if (err instanceof LoginContinuedInParentWindowError) return

          await optionsRef.current?.onRestored?.(null)

          console.error('Failed to init:', err)

          localStorage.removeItem(CURRENT_AUTHENTICATED_SUB)
        },
      )
      .finally(() => {
        if (clientRef.current !== oauthClient) return

        setInitialized(true)
      })
  }, [oauthClient])

  useSignaledEffect(
    (signal) => {
      if (!oauthClient) return
      if (!oauthAgent) return

      oauthClient.addEventListener(
        'deleted',
        ({ detail }) => {
          if (oauthAgent.sub === detail.sub) {
            setOAuthAgent(null)
            void optionsRef.current?.onSignedOut?.()
          }
        },
        { signal },
      )

      void oauthAgent.refreshIfNeeded()
    },
    [oauthClient, oauthAgent],
  )

  const signIn = useCallback(
    async (input: string, options?: Omit<AuthorizeOptions, 'state'>) => {
      if (authenticating) throw new Error('Already loading')
      if (!oauthClient || !initialized)
        throw new Error('Client not initialized')

      setAuthenticating(true)

      try {
        const state = await optionsRef.current?.getState?.()
        const agent = await oauthClient.signIn(input, { ...options, state })
        setOAuthAgent(agent)
        await optionsRef.current?.onSignedIn?.(agent, state ?? null)
      } catch (err) {
        console.error('Failed to sign in:', err)
        throw err
      } finally {
        setAuthenticating(false)
      }
    },
    [authenticating, oauthClient, initialized, optionsRef],
  )

  const signOut = useCallback(async () => {
    if (authenticating) throw new Error('Already loading')
    if (!oauthAgent) throw new Error('Not signed in')

    setAuthenticating(true)

    try {
      await oauthAgent.signOut()
    } catch (err) {
      console.error('Failed to clear credentials', err)

      setOAuthAgent(null)
      await optionsRef.current?.onSignedOut?.()
    } finally {
      setAuthenticating(false)
    }
  }, [authenticating, oauthAgent, optionsRef])

  const pdsAgent = useMemo(
    () => (oauthAgent ? new BskyAgent(oauthAgent) : undefined),
    [oauthAgent],
  )

  // Memoize the return value to avoid re-renders in consumers
  return useMemo<OAuth>(
    () => ({
      isInitialized: initialized,
      isAuthenticating: authenticating,
      isLoggedIn: oauthAgent != null,

      signIn,
      signOut,

      oauthClient,
      oauthAgent,
      pdsAgent,
    }),
    [
      initialized,
      authenticating,
      oauthClient,
      oauthAgent,
      pdsAgent,
      signIn,
      signOut,
    ],
  )
}
